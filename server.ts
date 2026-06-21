import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Set up server-side Gemini API client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// Configure middleware for large JSON bodies containing base64 media uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Ensure upload directory exists
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Serve uploaded files statically at the /uploads path
app.use("/uploads", express.static(UPLOADS_DIR));

// 1. Base64 Upload Endpoint - saves to server disk to bypass Firestore's 1MB limit
app.post("/api/upload", async (req, res) => {
  try {
    const { fileData, originalMimeType, extension } = req.body;
    if (!fileData) {
      return res.status(400).json({ error: "No file data provided" });
    }

    // Clean up the base64 prefix if present
    const base64Data = fileData.replace(/^data:.*,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    const uniqueId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const originalExt = extension || "bin";
    const filename = `media_${uniqueId}.${originalExt}`;
    const filePath = path.join(UPLOADS_DIR, filename);

    await fs.promises.writeFile(filePath, buffer);

    // Identify category: image, video, audio
    let type = "text";
    if (originalMimeType?.startsWith("image/")) {
      type = "image";
    } else if (originalMimeType?.startsWith("video/")) {
      type = "video";
    } else if (originalMimeType?.startsWith("audio/")) {
      type = "audio";
    } else {
      // Backup classification by extension
      const audioExts = ["mp3", "m4a", "wav", "webm", "ogg", "aac"];
      const videoExts = ["mp4", "mov", "avi", "webm", "mkv"];
      const imageExts = ["jpg", "jpeg", "png", "webp", "gif", "svg"];
      if (audioExts.includes(originalExt.toLowerCase())) type = "audio";
      else if (videoExts.includes(originalExt.toLowerCase())) type = "video";
      else if (imageExts.includes(originalExt.toLowerCase())) type = "image";
    }

    res.json({
      url: `/uploads/${filename}`,
      type,
      filename,
    });
  } catch (error: any) {
    console.error("Upload error:", error);
    res.status(500).json({ error: error.message || "Failed to upload file" });
  }
});

// 2. Gemini AI Caption Helper Endpoint
app.post("/api/ai/caption", async (req, res) => {
  try {
    const { prompt, mediaBase64, mimeType } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    let contentsParts: any[] = [{ text: prompt }];

    // If there's an image base64, send it as multimodal part
    if (mediaBase64 && mimeType) {
      const cleanBase64 = mediaBase64.replace(/^data:.*,/, "");
      contentsParts.push({
        inlineData: {
          mimeType,
          data: cleanBase64,
        },
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts: contentsParts },
      config: {
        systemInstruction: "Você é o assistente oficial de criação da rede social JPvano. Escreva legendas curtas, descoladas e atraentes em português (brasileiro). Use emojis moderadamente, inclua hashtags criativas e evite textões longos. Foco em engajamento real e estilo influencer jovem.",
        temperature: 1.0,
      }
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Gemini context error:", error);
    res.status(500).json({ error: error.message || "Failed to generate caption" });
  }
});

// 3. Connect Vite Dev Server or Production Static Files
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[JPvano Backend] Running on http://localhost:${PORT}`);
  });
}

startServer();
