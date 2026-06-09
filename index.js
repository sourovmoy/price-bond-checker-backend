require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const { MongoClient, ServerApiVersion } = require("mongodb");
const port = process.env.PORT || 3000;

// 🔥 New modular firebase imports to fix version crashes
const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const serviceAccount = require("./price-bond-checker-firebase-admin.json");

// ✅ Fixes: TypeError: Cannot read properties of undefined (reading 'length')
if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount),
  });
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
    await client.connect();
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
    app.post("/add-price-bond", verifyJWT, (req, res) => {
      console.log(req.body, req.tokenEmail);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
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
