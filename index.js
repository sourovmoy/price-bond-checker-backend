require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());

app.get("/", (req, res) => {
  res.send("Hello World!");
});
console.log(`Hello ${process.env.HELLO}`);
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
