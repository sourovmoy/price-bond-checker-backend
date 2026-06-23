import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
import { Buffer } from "buffer";
import multer from "multer";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { sendWindowNotification } from "./Utils/sendEmail.js";
import { renderUnsubscribePage } from "./Utils/renderUnsubscribePage.js";
import { introEmail } from "./Utils/SendIntroEmail.js";
const app = express();
const port = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage() });

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
// Verify Admin
const verifyAdmin = async (req, res, next) => {
  try {
    const database = await getDB();
    const usersCollection = database.collection("users");
    const email = req.tokenEmail; // verifyJWT থেকে পাওয়া ইমেইল

    const user = await usersCollection.findOne({ email });

    if (!user || user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Forbidden Access! অ্যাডমিন ছাড়া অনুমতি নেই।" });
    }

    next();
  } catch (error) {
    res.status(500).json({ message: "Admin verification failed" });
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
    user.emailNotification = true;
    user.unsubscribeToken = crypto.randomUUID();

    const results = await usersCollection.insertOne(user);
    if (results.acknowledged) {
      introEmail(email, user?.name, user.unsubscribeToken);
    }

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

    const { name, phone, imageUrl } = user;

    const newBond = {
      number: PriceBond,
      addedAt: new Date(),
      result: "pending",
    };

    const result = await pricebondCollection.updateOne(
      { email },
      {
        $setOnInsert: { name, phone, email, imageUrl },
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

// Admin all pricebonds
app.get("/admin/all-users-bonds", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const database = await getDB();
    const pricebondCollection = database.collection("Pricebonds");

    // মঙ্গোডিবি এগ্রিগেশন পাইপলাইন ব্যবহার করে অপ্টিমাইজড ডাটা নিয়ে আসা
    const usersBondsData = await pricebondCollection
      .aggregate([
        {
          $project: {
            _id: 1,
            name: 1,
            email: 1,
            phone: 1,
            imageUrl: 1,
            // যদি PriceBond অ্যারে থাকে তবে তার সাইজ (সংখ্যা) বের করবে, না থাকলে ০ দেবে
            bondsCount: {
              $cond: {
                if: { $isArray: "$PriceBond" },
                then: { $size: "$PriceBond" },
                else: 0,
              },
            },
          },
        },
      ])
      .toArray();

    res.status(200).json(usersBondsData);
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// For admin each users bond

app.get("/admin/users-bond/:id", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const database = await getDB();
    const pricebondCollection = database.collection("Pricebonds");
    const result = await pricebondCollection.findOne(query);
    res.status(200).json({
      message: "Users bonds are found",
      result: result || {},
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to get users bonds",
    });
  }
});

// For admin stats
app.get("/admin/dashboard-stats", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const db = await getDB();
    const usersCollection = db.collection("users");
    const pricebondCollection = db.collection("Pricebonds");
    // admin check
    const requester = await usersCollection.findOne({ email: req.tokenEmail });
    const totalUsers = await usersCollection.countDocuments();
    const allBondDocs = await pricebondCollection.find({}).toArray();

    let totalBonds = 0;
    let totalWon = 0;
    let totalLost = 0;
    let totalPending = 0;

    const userBondData = allBondDocs.map((doc) => {
      const bonds = doc.PriceBond || [];
      const won = bonds.filter((b) => b.result === "won").length;
      const lost = bonds.filter((b) => b.result === "lost").length;
      const pending = bonds.filter((b) => b.result === "pending").length;

      totalBonds += bonds.length;
      totalWon += won;
      totalLost += lost;
      totalPending += pending;

      return {
        name: doc.name,
        email: doc.email,
        totalBonds: bonds.length,
        won,
        lost,
        pending,
      };
    });

    const chartData = userBondData
      .sort((a, b) => b.totalBonds - a.totalBonds)
      .slice(0, 10); // top 10 user

    res.status(200).json({
      totalUsers,
      totalBonds,
      totalWon,
      totalLost,
      totalPending,
      totalValue: totalBonds * 100,
      users: userBondData, // table-এর জন্য full list
      chartData, // chart-এর জন্য top 10
    });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// For result upload +
app.post(
  "/admin/upload-result",
  verifyJWT,
  verifyAdmin,
  upload.single("resultPdf"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "PDF ফাইল আপলোড করুন!" });
      }
      const data = await pdfParse(req.file.buffer);
      const text = data.text;

      const numberPattern = /\b\d{7}\b/g;
      const matchedNumbers = [...new Set(text.match(numberPattern) || [])];

      if (matchedNumbers.length === 0) {
        return res.status(400).json({
          message: "PDF থেকে কোনো বন্ড নম্বর খুঁজে পাওয়া যায়নি!",
        });
      }

      const db = await getDB();
      const usersCollection = db.collection("users");
      const pricebondCollection = db.collection("Pricebonds");
      const notificationCollection = db.collection("notifications");
      const allDocs = await pricebondCollection.find({}).toArray();

      let updatedUserCount = 0;
      let totalWonBonds = 0;
      let emailPromises = [];
      let notificationDocs = [];

      for (const doc of allDocs) {
        let changed = false;
        const wonBondsForThisUser = [];
        const updatedBonds = (doc.PriceBond || []).map((bond) => {
          const last7 = bond.number.slice(-7);

          if (bond.result === "pending" && matchedNumbers.includes(last7)) {
            changed = true;
            totalWonBonds++;
            wonBondsForThisUser.push(bond.number);
            return { ...bond, result: "won" };
          }
          return bond;
        });

        if (changed) {
          await pricebondCollection.updateOne(
            { _id: doc._id },
            { $set: { PriceBond: updatedBonds } },
          );
          updatedUserCount++;
          const userDoc = await usersCollection.findOne({ email: doc.email });
          if (userDoc.emailNotification !== false) {
            wonBondsForThisUser.forEach((bondNumber) => {
              emailPromises.push(
                sendWindowNotification(
                  doc.email,
                  doc.name,
                  bondNumber,
                  userDoc?.unsubscribeToken,
                ),
              );
              notificationDocs.push({
                email: doc.email,
                name: doc.name,
                bondNumber,
                message: `আপনার বন্ড ${bondNumber} বিজয়ী হয়েছে!`,
                isRead: false,
                createdAt: new Date(),
              });
            });
          }
        }
      }
      if (notificationDocs.length > 0) {
        await notificationCollection.insertMany(notificationDocs);
      }
      await Promise.allSettled(emailPromises);

      res.status(200).json({
        success: true,
        message: `${matchedNumbers.length}টি বিজয়ী নম্বর পাওয়া গেছে। ${updatedUserCount}জন ইউজারের মোট ${totalWonBonds}টি বন্ড বিজয়ী হয়েছে।`,
        matchedNumbers,
      });
    } catch (error) {
      res.status(500).json({ message: "PDF প্রসেস করতে ব্যর্থ হয়েছে!" });
    }
  },
);

// For bond delete
app.delete("/delete-bond/:bondNumber", verifyJWT, async (req, res) => {
  try {
    const email = req.tokenEmail;
    const bondNumber = decodeURIComponent(req.params.bondNumber); // ✅ decode করো

    const db = await getDB();
    const pricebondCollection = db.collection("Pricebonds");

    const result = await pricebondCollection.updateOne(
      { email },
      { $pull: { PriceBond: { number: bondNumber } } },
    );

    if (result.modifiedCount === 0) {
      return res
        .status(404)
        .json({ message: "এই বন্ডটি খুঁজে পাওয়া যায়নি!" });
    }
    res.status(200).json({
      success: true,
      message: "বন্ড সফলভাবে মুছে ফেলা হয়েছে!",
    });
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Notification for the user's won pricebonds
app.get("/notification", verifyJWT, async (req, res) => {
  try {
    const email = req.tokenEmail;
    const page = parseInt(req.query.page) || 1;
    const limit = 3;
    const skip = (page - 1) * limit;
    const db = await getDB();
    const notificationCollection = db.collection("notifications");
    const notifications = await notificationCollection
      .find({ email })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
    const totalCount = await notificationCollection.countDocuments({ email });
    const hasMore = skip + notifications.length < totalCount;
    res.status(200).json({
      notifications,
      hasMore,
      totalCount,
    });
  } catch (error) {
    res.status(500).json({ message: "Notification আনতে ব্যর্থ হয়েছে!" });
  }
});

// Unread Count
app.get("/notification/unread-count", verifyJWT, async (req, res) => {
  try {
    const email = req.tokenEmail;
    const db = await getDB();
    const notificationCollection = db.collection("notifications");

    const count = await notificationCollection.countDocuments({
      email,
      isRead: false,
    });

    res.status(200).json({ count });
  } catch (error) {
    res.status(500).json({ message: "Count আনতে ব্যর্থ হয়েছে!" });
  }
});
// Mark as unread
app.patch("/notification/mark-all-read", verifyJWT, async (req, res) => {
  try {
    const email = req.tokenEmail;
    const db = await getDB();
    const notificationCollection = db.collection("notifications");

    const result = await notificationCollection.updateMany(
      { email, isRead: false },
      { $set: { isRead: true } },
    );

    res.status(200).json({
      success: true,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    res.status(500).json({ message: "Update করতে ব্যর্থ হয়েছে!" });
  }
});
//user er data show er jonno ata

app.get("/user/me", verifyJWT, async (req, res) => {
  try {
    const database = await getDB();
    const userCollection = database.collection("users");
    const email = req.tokenEmail;

    const user = await userCollection.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: "Failed to get user me" });
  }
});

//Unsubscribe email
app.get("/unsubscribe", async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res
        .status(400)
        .send(renderUnsubscribePage("Invalid", "লিংকটি সঠিক নয়।"));
    }
    const db = await getDB();
    const usersCollection = db.collection("users");

    const user = await usersCollection.findOne({ unsubscribeToken: token });
    if (!user) {
      return res
        .status(404)
        .send(renderUnsubscribePage("Not Found", "ইউজার পাওয়া যায়নি।"));
    }
    if (!user.emailNotification) {
      return res.send(
        renderUnsubscribePage("Already Done", "আপনি আগেই unsubscribe করেছেন।"),
      );
    }

    await usersCollection.updateOne(
      { unsubscribeToken: token },
      { $set: { emailNotification: false } },
    );
    res.send(
      renderUnsubscribePage("সফল হয়েছে", "আপনাকে আর email পাঠানো হবে না।"),
    );
  } catch (error) {
    res
      .status(500)
      .send(renderUnsubscribePage("Error", "কিছু একটা সমস্যা হয়েছে।"));
  }
});
// Server Listen
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
