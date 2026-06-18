import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { MongoClient, ServerApiVersion } from "mongodb";
import { Buffer } from "buffer"; // ✅ ES Module-এ নিরাপদ ডিকোডিংয়ের জন্য

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const app = express(); // ✅ ফিক্স: app ইনিশিয়ালাইজ করা হলো
const port = process.env.PORT || 3000; // ✅ ফিক্স: port ডিফাইন করা হলো

// ✅ Firebase Admin Initialization
try {
  if (getApps().length === 0) {
    let base64Key = process.env.FB_SERVICE_KEY;

    if (!base64Key) {
      throw new Error("FB_SERVICE_KEY environment variable is missing!");
    }

    base64Key = base64Key.trim().replace(/^['"]|['"]$/g, "");

    const decodedKey = Buffer.from(base64Key, "base64").toString("utf-8");
    const serviceAccount = JSON.parse(decodedKey);

    initializeApp({
      credential: cert(serviceAccount),
    });
    console.log("Firebase Admin Initialized Successfully! 🔥");
  }
} catch (error) {
  console.error("Firebase Initialization Error ❌:", error.message);
}

// Middlewares
app.use(
  cors({
    origin: process.env.FRONTEND_SERVER,
    credentials: true,
  }),
);
app.use(express.json());

// 🍃 MongoDB Client Setup
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// 🚀 Vercel-এর জন্য ডাইনামিক ডাটাবেজ কানেকশন
let dbInstance = null;
async function getDB() {
  if (dbInstance) return dbInstance;
  try {
    await client.connect();
    dbInstance = client.db("pricebond-checker");
    return dbInstance;
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    throw error;
  }
}

// Firebase Token Verification Middleware
const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];
  if (!token) return res.status(401).send({ message: "Unauthorized Access!" });

  try {
    const decoded = await getAuth().verifyIdToken(token);
    req.tokenEmail = decoded.email;
    next();
  } catch (err) {
    return res
      .status(401)
      .send({ message: "Unauthorized Access!", err: err.message });
  }
};

// 🏠 Base Route
app.get("/", (req, res) => {
  res.send("Hello World! Server is running perfectly with ES Modules.");
});

// 👤 User Post Route
app.post("/user", verifyJWT, async (req, res) => {
  try {
    const database = await getDB();
    const usersCollection = database.collection("users");

    const email = req.tokenEmail;

    const existUser = await usersCollection.findOne({ email });
    if (existUser) {
      return res.status(200).json({
        message: "User already exists",
        user: existUser,
      });
    }

    const user = req.body;
    user.role = "member";
    user.created_at = new Date();
    user.email = email;

    const results = await usersCollection.insertOne(user);
    res.status(201).json({
      message: "User is stored to database",
      results,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
    });
  }
});
// 👤 User Update
app.patch("/user/update-profile", verifyJWT, async (req, res) => {
  try {
    const database = await getDB();
    const userCollection = database.collection("users");
    const email = req.tokenEmail;
    const query = { email: email };

    const result = await userCollection.updateOne(query, {
      $set: req.body,
    });
    res.status(201).json({
      message: "User Update",
      result,
    });
  } catch (error) {
    console.log(error.message);

    res.status(500).json({
      message: "Cannot update the user",
    });
  }
});

// 🎟️ Add Price Bond Route
app.post("/add-price-bond", verifyJWT, async (req, res) => {
  try {
    const database = await getDB();
    const usersCollection = database.collection("users");
    const pricebondCollection = database.collection("Pricebonds");

    const { PriceBond } = req.body;
    const email = req.tokenEmail;

    const user = await usersCollection.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found in database!" });
    }

    // ✅ Duplicate check
    const duplicate = await pricebondCollection.findOne({
      email,
      "PriceBond.number": PriceBond,
    });

    if (duplicate) {
      return res
        .status(409)
        .json({ message: "এই বন্ড নম্বরটি আগেই যোগ করা হয়েছে!" });
    }

    const { name, phone } = user;

    const newBond = {
      number: PriceBond,
      addedAt: new Date(),
      result: "pending",
    };

    const result = await pricebondCollection.updateOne(
      { email },
      {
        $setOnInsert: { name, phone, email },
        $push: { PriceBond: newBond }, // ✅ $addToSet এর বদলে $push
      },
      { upsert: true },
    );

    res.status(200).json({
      success: true,
      message: "বন্ড সফলভাবে যোগ হয়েছে!",
      result,
    });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// user role
app.get("/user/role", verifyJWT, async (req, res) => {
  try {
    const database = await getDB();
    const usersCollection = database.collection("users");
    const email = req.tokenEmail;

    const query = { email: email };
    const user = await usersCollection.findOne(query);

    res.status(200).json({
      role: user?.role || "member",
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to get user role",
    });
  }
});

// my bonds
app.get("/my-price-bond", verifyJWT, async (req, res) => {
  try {
    const email = req.tokenEmail;
    const database = await getDB();
    const pricebondCollection = database.collection("Pricebonds");
    const query = { email: email };
    const result = await pricebondCollection.findOne(query);
    res.status(200).json({
      message: "PriceBonds are found",
      PriceBond: result?.PriceBond || [],
    });
  } catch (error) {
    console.log("from my pricebond", error.message);

    res.status(500).json({
      message: "Failed to get my bonds",
    });
  }
});

// User Overview
app.get("/dashboard/stats", verifyJWT, async (req, res) => {
  try {
    const db = await getDB();
    const pricebondCollection = db.collection("Pricebonds");
    const email = req.tokenEmail;

    const result = await pricebondCollection.findOne({ email });
    const bonds = result?.PriceBond || [];

    const total = bonds.length;
    const won = bonds.filter((b) => b.result === "won").length;
    const lost = bonds.filter((b) => b.result === "lost").length;
    const pending = bonds.filter((b) => b.result === "pending").length;
    const totalValue = total * 100;

    // মাস অনুযায়ী count
    const monthMap = {};
    bonds.forEach((bond) => {
      if (!bond.addedAt) return;
      const date = new Date(bond.addedAt);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      monthMap[month] = (monthMap[month] || 0) + 1;
    });

    const monthlyData = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));

    res.status(200).json({
      total,
      won,
      lost,
      pending,
      totalValue,
      monthlyData,
    });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Server Listen
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
