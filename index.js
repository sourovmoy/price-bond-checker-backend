require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const { MongoClient, ServerApiVersion } = require("mongodb");
const port = process.env.PORT || 3000;

// 🔥 New modular firebase imports to fix version crashes
const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

// ✅ Fixes: TypeError: Cannot read properties of undefined (reading 'length')
try {
  if (getApps().length === 0) {
    // এনভায়রনমেন্ট ভেরিয়েবল থেকে Base64 স্ট্রিং এনে ডিকোড করা হচ্ছে
    const decodedKey = Buffer.from(
      process.env.FB_SERVICE_KEY,
      "base64",
    ).toString("utf-8");
    const serviceAccount = JSON.parse(decodedKey);

    initializeApp({
      credential: cert(serviceAccount),
    });
    console.log("Firebase Admin Initialized! 🔥");
  }
} catch (error) {
  console.error("Firebase Initialization Error ❌:", error.message);
}

app.use(
  cors({
    origin: process.env.FRONTEND_SERVER,
    credentials: true,
  }),
);
app.use(express.json());

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("Hello World!");
});
// middlewares
const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];

  if (!token) return res.status(401).send({ message: "Unauthorized Access!" });
  try {
    // here update needed for verson update
    const decoded = await getAuth().verifyIdToken(token);
    req.tokenEmail = decoded.email;
    next();
  } catch (err) {
    return res.status(401).send({ message: "Unauthorized Access!", err });
  }
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    const database = client.db("pricebond-checker");
    const usersCollection = database.collection("users");
    const pricebondCollection = database.collection("Pricebonds");

    app.post("/user", async (req, res) => {
      try {
        const user = req.body;
        user.role = "member";
        user.created_at = new Date();
        const email = user?.email;
        const existUser = await usersCollection.findOne({ email: email });
        if (existUser) {
          return res.status(200).json({
            message: "User already exists",
            user: existUser,
          });
        }

        const results = await usersCollection.insertOne(user);

        res.status(201).json({
          message: "User is stored to database",
          results,
        });
      } catch (error) {
        res.status(500).json({
          message: "Internal Server Error",
          error: error.message,
        });
      }
    });
    app.post("/add-price-bond", verifyJWT, async (req, res) => {
      try {
        const { PriceBond } = req.body;
        const email = req.tokenEmail;
        const user = await usersCollection.findOne({ email });
        if (!user) {
          return res
            .status(404)
            .json({ message: "User not found in database!" });
        }
        const { name, phone } = user;

        const query = { email: email };
        const updateDoc = {
          $setOnInsert: { name, phone, email },
          $addToSet: { PriceBond: PriceBond },
        };
        const options = { upsert: true };

        const result = await pricebondCollection.updateOne(
          query,
          updateDoc,
          options,
        );

        res.status(200).json({
          success: true,
          message: "Price bond array updated successfully!",
          result,
        });
      } catch (error) {
        res.status(500).json({
          message: "Internal Server Error",
          error: error.message,
        });
      }
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
