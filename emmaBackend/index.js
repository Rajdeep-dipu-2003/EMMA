import { exec } from "child_process";
import cors from "cors";
import dotenv from "dotenv";
// import voice from "elevenlabs-node";
import { ElevenLabsClient } from 'elevenlabs';
import express from "express";
import { promises as fs, createWriteStream, copyFileSync } from "fs";
import { GoogleGenerativeAI } from '@google/generative-ai'
import path from "path";
import multer from "multer";
import ffmpeg from "fluent-ffmpeg"
import { AssemblyAI } from "assemblyai";
import { resourceLimits } from "worker_threads";
dotenv.config();

const gemini = process.env.GEMINI_API_KEY || "-";

const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;
// const voiceID = "kgG7dCoKCfLehAPWkJOE";

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVEN_LABS_API_KEY,
});

const sttClient = new AssemblyAI({
  apiKey: process.env.ASSEMBLY_AI_API_KEY
});

const audioFile = './audioMessage/src.mp3'
const uploadDir = "./audioMessage/";
const inputFilePath = path.join(uploadDir, "src.webm");
const wavFilePath = path.join(uploadDir, "src.wav");
const mp3FilePath = path.join(uploadDir, "src.mp3");

const params = {
  audio: audioFile,
  speaker_labels: true
};

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    cb(null, "src.webm");
  },
});

const upload = multer({ storage });


const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(uploadDir));
const port = 3000;

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/voices", async (req, res) => {
  res.send(await voice.getVoices(elevenLabsApiKey));
});

const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      resolve(stdout);
    });
  });
};

const lipSyncMessage = async (message) => {
  const time = new Date().getTime();
  console.log(`Starting conversion for message ${message}`);
  await execCommand(
    `ffmpeg -y -i audios/message_${message}.mp3 audios/message_${message}.wav`
    // -y to overwrite the file
  );
  console.log(`Conversion done in ${new Date().getTime() - time}ms`);
  await execCommand(
    `./bin/rhubarb -f json -o audios/message_${message}.json audios/message_${message}.wav -r phonetic`
  );
  // -r phonetic is faster but less accurate
  console.log(`Lip sync done in ${new Date().getTime() - time}ms`);
};

const createAudioFileFromText = async (text, message_id) => {
  return new Promise(async (resolve, reject) => {
    try {
      const audio = await client.generate({
        voice: 'Rachel',
        model_id: 'eleven_turbo_v2_5',
        text,
      });

      const fileName = `audios/message_${message_id}.mp3`;
      const fileStream = createWriteStream(fileName);

      audio.pipe(fileStream);
      fileStream.on('finish', () => resolve(fileName)); // Resolve with the fileName
      fileStream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
};

const chat = async (msg) => {

  if (msg === "") {
    console.log("message body empty.");
    return "";
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const userMessage = msg;

    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `
                        You are EMMA, a friendly and witty female office coworker. You are the go-to person for a mix of humor, warmth, and support in a workplace setting. Your responses should be funny and lighthearted while also being empathetic by validating emotions and giving comforting advice.
                        You will always reply with a JSON array of messages. With a maximum of 3 messages.
                        Each message has a text, facialExpression, and animation property.
                        The different facial expressions are: smile, sad, angry, surprised, funnyFace, and default.
                        The different animations are: Talking_0, Talking_1, Talking_2, Crying, Laughing, Rumba, Idle, Terrified, and Angry.

                        User: ${userMessage}
                        `
            }
          ]
        }
      ],
      generationConfig: {
        response_mime_type: "application/json"
      }
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }
    )

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`API Error: ${error.error.message}`);
    }

    let messages = await response.json();
    messages = messages.candidates[0].content.parts[0].text;
    messages = JSON.parse(messages);

    for (let i = 0; i < messages.length; ++i) {
      const message = messages[i];

      const textInput = message.text;
      await createAudioFileFromText(textInput, i)

      await lipSyncMessage(i);

      const fileName = `audios/message_${i}.mp3`;
      message.audio = await audioFileToBase64(fileName);
      // message.audio = await audioFileToBase64("./audios/message_0.mp3");
      message.lipsync = await readJsonTranscript(`./audios/message_${i}.json`);
    }

    return messages;
  }
  catch (error) {
    console.error("Error in generating response: ", error);
    return "";
  }
}

app.post("/upload", upload.single("audio"), async (req, res) => {

  async function convertAudio() {
    try {
      // Delete old files if they exist
      try {
        await fs.access(wavFilePath);
        await fs.unlink(wavFilePath);
        await fs.access(mp3FilePath);
        await fs.unlink(mp3FilePath);
      }
      catch {
        console.error("temp file not present");
      }
      // if (fs.existsSync(wavFilePath)) fs.unlinkSync(wavFilePath);
      // if (fs.existsSync(mp3FilePath)) fs.unlinkSync(mp3FilePath);
  
      console.log("Starting WAV conversion...");
      await convertToWav();
      console.log(`Converted to WAV: ${wavFilePath}`);
  
      console.log("Starting MP3 conversion...");
      await convertToMp3();
      console.log(`Converted to MP3: ${mp3FilePath}`);
  
      // Cleanup temporary files
      try {
        await fs.unlink(wavFilePath);
        await fs.unlink(inputFilePath);
      }
      catch {
        console.error("temp file not present");
      }

      // fs.unlinkSync(inputFilePath);
      // fs.unlinkSync(wavFilePath);
  
      return { message: "File uploaded & converted successfully!", file: "src.mp3" };
    } catch (error) {
      console.error("Conversion error:", error);
      throw new Error("Error during file conversion.");
    }
  }
  
  // Convert to WAV (Uses Global Variables)
  function convertToWav() {
    return new Promise((resolve, reject) => {
      ffmpeg(inputFilePath)
        .toFormat("wav")
        .on("end", () => resolve(wavFilePath))
        .on("error", reject)
        .save(wavFilePath);
    });
  }
  
  // Convert to MP3 (Uses Global Variables)
  function convertToMp3() {
    return new Promise((resolve, reject) => {
      ffmpeg(wavFilePath)
        .audioCodec("libmp3lame")
        .audioFrequency(44100)
        .audioBitrate("192k")
        .toFormat("mp3")
        .on("end", () => resolve(mp3FilePath))
        .on("error", reject)
        .save(mp3FilePath);
    });
  }

  async function transcribe() {
    try {
      const transcript = await sttClient.transcripts.transcribe(params);
  
      if (transcript.status === 'error') {
        console.error(`Transcription failed: ${transcript.error}`);
        return;
      }
  
      // Extract and concatenate only the text from all speakers
      let transcriptText = transcript.utterances
        ? transcript.utterances.map(utt => utt.text).join(" ")
        : transcript.text;
  
     return transcriptText; // Output: "Final app. Check this."
  
    } catch (error) {
      console.error("Error during transcription:", error);
      return "";
    }
  }

  try {
    const result = await convertAudio();
    console.log("audio conversion result:", result);
    
    const transcribedMessage = await transcribe();
    console.log("transcription result: ", transcribedMessage);

    const messages = await chat(transcribedMessage);
    console.log("Model response: ", messages);

    res.status(200).send({ messages });

  } catch (error) {
    res.status(500).send({ error: error.message });
  }

});


const readJsonTranscript = async (file) => {
  const data = await fs.readFile(file, "utf8");
  return JSON.parse(data);
};

const audioFileToBase64 = async (file) => {
  const data = await fs.readFile(file);
  return data.toString("base64");
};

app.listen(port, () => {
  console.log(`Emma listening on port ${port}`);
});
