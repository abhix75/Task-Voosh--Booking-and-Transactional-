const express = require("express");
const axios = require("axios");
const { ServerConfig } = require("../../config");
const { BookingController } = require("../../controllers");

const router = express.Router();

router.post(
  "/",
  BookingController.createBooking
);
router.post("/payments", BookingController.makePayment);

module.exports = router;
