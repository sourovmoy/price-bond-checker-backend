// import dotenv from "dotenv";
import crypto from "crypto";

// dotenv.config();

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
import { introEmail } from "./Utils/sendIntroEmail.js";
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
if (!uri) {
  console.error(
    "Missing MONGODB_URI environment variable. Please set it in .env or your deployment environment.",
  );
  process.exit(1);
}

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

    const { name, photoURL, phone } = req.body;

    const user = {
      name,
      photoURL,
      email,
      phone,
      role: "member",
      created_at: new Date(),
      emailNotification: true,
      unsubscribeToken: crypto.randomUUID(),
    };

    const results = await usersCollection.insertOne(user);

    if (results.acknowledged) {
      introEmail(email, name, user.unsubscribeToken).catch((err) =>
        console.error("Intro email failed:", err.message),
      );
    }

    res.status(201).json({
      message: "User is stored to database",
      results,
    });
  } catch (error) {
    console.error("POST /user error:", error);
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
    const prizeResultCollection = database.collection("PrizebondResults");
    const notificationCollection = database.collection("notifications");

    const { PriceBond } = req.body;
    if (!PriceBond || typeof PriceBond !== "string") {
      return res
        .status(400)
        .json({ success: false, message: "সঠিক বন্ড নম্বর প্রদান করুন!" });
    }
    const email = req.tokenEmail;

    const user = await usersCollection.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found in database!" });
    }

    const duplicate = await pricebondCollection.findOne({
      email,
      "PriceBond.number": PriceBond,
    });

    if (duplicate) {
      return res
        .status(409)
        .json({ message: "এই বন্ড নম্বরটি আগেই যোগ করা হয়েছে!" });
    }
    const slicePricebond = PriceBond.slice(-7);
    const matchedResult = await prizeResultCollection.findOne({
      numbers: slicePricebond,
    });

    let bondStatus = "pending";
    let prizeDetails = null;
    let successMessage =
      "বন্ডটি সফলভাবে আপনার অ্যাকাউন্টে যোগ করা হয়েছে। পরবর্তী ড্র-তে চোখ রাখুন!";
    if (matchedResult) {
      bondStatus = "won";
      const specificPrize = matchedResult.prizes.find((p) =>
        p.numbers.includes(slicePricebond),
      );

      if (specificPrize) {
        prizeDetails = {
          label: specificPrize.label,
          amount: specificPrize.amount,
          tier: specificPrize.tier,
        };
        successMessage = `অভিনন্দন! আপনার বন্ডটি ${specificPrize.label} (${specificPrize.amount} টাকা) জিতেছে!`;
      }
    }

    const { name, phone, imageUrl } = user;

    const newBond = {
      number: PriceBond,
      addedAt: new Date(),
      result: bondStatus,
      ...(prizeDetails && prizeDetails),
    };

    const result = await pricebondCollection.updateOne(
      { email },
      {
        $setOnInsert: { name, phone, email, imageUrl },
        $push: { PriceBond: newBond },
      },
      { upsert: true },
    );
    if (bondStatus === "won" && prizeDetails) {
      const notificationData = {
        email: req.tokenEmail,
        name,
        bondNumber: PriceBond,
        prize: {
          label: prizeDetails.label,
          amount: prizeDetails.amount,
        },
        message: `আপনার বন্ড ${PriceBond} বিজয়ী হয়েছে! পুরস্কার: ${prizeDetails.label} - ৳${prizeDetails.amount.toLocaleString("bn-BD")}`,
        isRead: false,
        createdAt: new Date(),
      };
      await notificationCollection.insertOne(notificationData);
      sendWindowNotification(
        user.email,
        user.name,
        [{ number: PriceBond, ...prizeDetails }],
        user.unsubscribeToken,
      );
    }
    res.status(200).json({
      success: true,
      message: successMessage,
      isWinner: bondStatus === "won",
      prizeInfo: prizeDetails,
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

// For result upload
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

      const data = await pdfParse(req.file.buffer, { verbosity: -1 });
      const text = data.text;

      const drawMatch = text.match(/(\d+)\s*Zg/i);
      const drawNumber = drawMatch ? parseInt(drawMatch[1]) : null;

      if (!drawNumber) {
        return res.status(400).json({
          message:
            "PDF থেকে ড্র নম্বর (যেমন: 122) স্বয়ংক্রিয়ভাবে খুঁজে পাওয়া যায়নি!",
        });
      }

      const numberPattern = /\b\d{7}\b/g;
      const rawNumbers = text.match(numberPattern) || [];

      const allNumbers = rawNumbers.filter((num, idx) => {
        if (num === "0000001" && idx === 0) return false;
        return true;
      });

      if (allNumbers.length === 0) {
        return res.status(400).json({
          message: "PDF থেকে কোনো বন্ড নম্বর খুঁজে পাওয়া যায়নি!",
        });
      }

      const prizeConfig = [
        { tier: 1, label: "১ম পুরস্কার", amount: 600000, count: 1 },
        { tier: 2, label: "২য় পুরস্কার", amount: 325000, count: 1 },
        { tier: 3, label: "৩য় পুরস্কার", amount: 100000, count: 2 },
        { tier: 4, label: "৪র্থ পুরস্কার", amount: 50000, count: 2 },
        { tier: 5, label: "৫ম পুরস্কার", amount: 10000, count: 40 },
      ];

      const expectedTotal = prizeConfig.reduce((sum, p) => sum + p.count, 0);
      if (allNumbers.length < expectedTotal) {
        return res.status(400).json({
          message: `PDF এ পর্যাপ্ত নম্বর নেই! পাওয়া গেছে ${allNumbers.length}টি, দরকার ${expectedTotal}টি।`,
        });
      }

      const prizeResult = [];
      const allWinningNumbers = new Set();
      const numberToPrize = new Map();
      let index = 0;

      for (const prize of prizeConfig) {
        const numbers = allNumbers.slice(index, index + prize.count);
        index += prize.count;

        numbers.forEach((num) => {
          allWinningNumbers.add(num);
          numberToPrize.set(num, {
            tier: prize.tier,
            label: prize.label,
            amount: prize.amount,
          });
        });

        prizeResult.push({
          tier: prize.tier,
          label: prize.label,
          amount: prize.amount,
          numbers,
        });
      }

      const database = await getDB();
      const usersCollection = database.collection("users");
      const pricebondCollection = database.collection("Pricebonds");
      const notificationCollection = database.collection("notifications");
      const prizeResultCollection = database.collection("PrizebondResults");

      const existing = await prizeResultCollection.findOne({
        numbers: { $in: [...allWinningNumbers] },
      });
      if (existing) {
        return res.status(409).json({
          message: "এই ড্র-এর ফলাফল আগেই আপলোড হয়েছে!",
        });
      }

      const allDocs = await pricebondCollection.find({}).toArray();
      if (allDocs.length === 0) {
        await prizeResultCollection.insertOne({
          uploadedAt: new Date(),
          drawNumber,
          uploadedBy: req.tokenEmail,
          totalWinners: expectedTotal,
          prizes: prizeResult,
          numbers: [...allWinningNumbers],
        });
        return res.status(200).json({
          success: true,
          message: "ফলাফল সেভ হয়েছে। কোনো ইউজারের বন্ড match হয়নি।",
          prizes: prizeResult,
        });
      }

      const userEmails = allDocs.map((doc) => doc.email);
      const allUsers = await usersCollection
        .find({ email: { $in: userEmails } })
        .toArray();
      const userMap = new Map(allUsers.map((u) => [u.email, u]));

      let updatedUserCount = 0;
      let totalWonBonds = 0;
      const bulkOps = [];
      const notificationDocs = [];
      const emailPromises = [];

      for (const doc of allDocs) {
        let changed = false;
        const wonBondsForThisUser = [];

        const updatedBonds = (doc.PriceBond || []).map((bond) => {
          const last7 = bond.number.slice(-7);

          if (bond.result === "pending" && allWinningNumbers.has(last7)) {
            const prizeInfo = numberToPrize.get(last7);
            changed = true;
            totalWonBonds++;
            wonBondsForThisUser.push({
              number: bond.number,
              ...prizeInfo,
            });
            return { ...bond, result: "won", ...prizeInfo };
          }
          return bond;
        });

        if (changed) {
          bulkOps.push({
            updateOne: {
              filter: { _id: doc._id },
              update: { $set: { PriceBond: updatedBonds } },
            },
          });

          updatedUserCount++;

          const userDoc = userMap.get(doc.email);
          if (!userDoc) {
            console.warn(`User not found for email: ${doc.email}`);
            continue;
          }

          wonBondsForThisUser.forEach(({ number, label, amount }) => {
            notificationDocs.push({
              email: doc.email,
              name: doc.name,
              bondNumber: number,
              prize: { label, amount },
              message: `আপনার বন্ড ${number} বিজয়ী হয়েছে! পুরস্কার: ${label} - ৳${amount.toLocaleString("bn-BD")}`,
              isRead: false,
              createdAt: new Date(),
            });
          });

          if (
            userDoc.emailNotification !== false &&
            wonBondsForThisUser.length > 0
          ) {
            emailPromises.push(
              sendWindowNotification(
                doc.email,
                doc.name,
                wonBondsForThisUser,
                userDoc.unsubscribeToken,
              ),
            );
          }
        }
      }

      if (bulkOps.length > 0) {
        await pricebondCollection.bulkWrite(bulkOps);
      }

      if (notificationDocs.length > 0) {
        await notificationCollection.insertMany(notificationDocs);
      }

      await Promise.allSettled(emailPromises);

      await prizeResultCollection.insertOne({
        uploadedAt: new Date(),
        drawNumber,
        uploadedBy: req.tokenEmail,
        totalWinners: expectedTotal,
        prizes: prizeResult,
        numbers: [...allWinningNumbers],
      });

      res.status(200).json({
        success: true,
        message: `${allWinningNumbers.size}টি বিজয়ী নম্বর সেভ হয়েছে। ${updatedUserCount}জন ইউজারের মোট ${totalWonBonds}টি বন্ড বিজয়ী হয়েছে।`,
        prizes: prizeResult,
      });
    } catch (error) {
      console.error("Upload result error:", error);
      res.status(500).json({
        message: "PDF প্রসেস করতে ব্যর্থ হয়েছে!",
        ...(process.env.NODE_ENV === "development" && {
          error: error.message,
        }),
      });
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

// for show all the results
app.get("/price-bonds-all-result", async (req, res) => {
  try {
    const database = await getDB();
    const prizeResultCollection = database.collection("PrizebondResults");

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 6;
    const skip = (page - 1) * limit;

    const [result, total] = await Promise.all([
      prizeResultCollection
        .find()
        .sort({ drawNumber: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      prizeResultCollection.countDocuments(),
    ]);

    res.status(200).json({
      message: "All result",
      result,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Data is not fetched" });
  }
});
//for single result
app.get("/price-bonds-all-result/:id", async (req, res) => {
  try {
    const database = await getDB();
    const prizeResultCollection = database.collection("PrizebondResults");
    const query = { _id: new ObjectId(req.params.id) };
    const result = await prizeResultCollection.findOne(query);
    res.status(200).json({
      message: "Single result",
      result,
    });
  } catch (error) {
    res.status(500).json({
      message: "Data is not feched",
    });
  }
});

//Users collection
app.get("/users-collection", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const db = await getDB();
    const userCollection = db.collection("users");
    const query = { email: { $ne: req.tokenEmail } };
    const user = await userCollection
      .find(query)
      .sort({ created_at: -1 })
      .toArray();
    res.status(200).json({ message: "All Users", user });
  } catch (error) {
    res.status(500).json({
      message: "Cannot get users",
    });
  }
});
// User delete
app.delete("/delete-user/:id", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const db = await getDB();
    const userCollection = db.collection("users");
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const result = await userCollection.deleteOne(query);
    res.status(200).json({ message: "User deleted successfully", result });
  } catch (error) {
    res.status(500).json({
      message: "Cannot delete user",
    });
  }
});
// Server Listen
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
