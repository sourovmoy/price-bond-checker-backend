require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const { MongoClient, ServerApiVersion } = require("mongodb");
const port = process.env.PORT || 3000;

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

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const database = client.db("pricebond-checker");
    const usersCollection = database.collection("users");

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
