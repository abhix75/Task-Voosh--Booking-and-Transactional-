const axios = require("axios");

const { StatusCodes } = require("http-status-codes");
const { Enums } = require("../utils/common");
const { BOOKED, CANCELLED } = Enums.Booking_status;
const { BookingRepository } = require("../repositories");
const { ServerConfig ,Queue} = require("../config");
const db = require("../models");
const AppError = require("../utils/error/app-error");
const bookingRepository = new BookingRepository();
async function createBooking(data) {

console.log('inside service create booking');
  const transaction = await db.sequelize.transaction(); 

  try {
    const menu = await axios.get(
      `${ServerConfig.MENU_SERVICE}/api/v1/menu/${data.menuId}`
    );
    const menuData = menu.data.data;
  

    const totalBillingAmount = data.quantity * menuData.Price;
    console.log(`TOTAL BILLING AMOUNT :`, totalBillingAmount);

    const bookingPayload = { ...data, totalCost: totalBillingAmount };
    console.log("BookingPayLoad : ", bookingPayload);
    const booking = await bookingRepository.create(bookingPayload, transaction);
    console.log("after booking repo ")
    await axios.patch(
      `${ServerConfig.MENU_SERVICE}/api/v1/menu/${data.menuId}/quantity`,
      {
        quantity: data.quantity, 
      }
    ); 
    await transaction.commit(); 
    return booking;
  } catch (error) {
    await transaction.rollback();
    console.log(error);
    throw error;
  }
}


async function makePayment(data) {
  const transaction = await db.sequelize.transaction();
  try {
    const bookingDetails = await bookingRepository.get(
      data.bookingId,
      transaction
    );
    console.log("Booking-Details",bookingDetails)
    if (bookingDetails.status == CANCELLED) {
      throw new AppError("The booking has expired", StatusCodes.BAD_REQUEST);
    }
    if (bookingDetails.status == BOOKED) {
      throw new AppError(
        "You have already booked your flight! You can't retry the request on a successful Booking ID",
        StatusCodes.BAD_REQUEST
      );
    }
    console.log(bookingDetails);
    const bookingTime = new Date(bookingDetails.createdAt);
    const currentTime = new Date();
    if (currentTime - bookingTime > 300000) {
      await cancelBooking(data.bookingId);
      throw new AppError("The booking has expired", StatusCodes.BAD_REQUEST);
    }
    
    if (bookingDetails.totalCost != data.totalCost) {
      throw new AppError(
        "There is a discrepancy in the amount of the payment",
        StatusCodes.PAYMENT_REQUIRED
      );
    }
    if (bookingDetails.userId != data.userId) {
      throw new AppError(
        "The user corresponding to the booking doesnt match",
        StatusCodes.BAD_REQUEST
      );
    }
   
    await bookingRepository.update(
      data.bookingId,
      { status: BOOKED },
      transaction
    );

  const flight = await axios.get(
    `${ServerConfig.MENU_SERVICE}/api/v1/menu/${bookingDetails.menuId}`
  );
  console.log("bookingDetails.menuId ",bookingDetails.menuId)
  await transaction.commit();

} catch (error) {
  console.log(error)
  await transaction.rollback();

  if (error.statusCodes == StatusCodes.BAD_REQUEST) {
    throw new AppError(
      "Booking Session has expired | The payment has already been made ",
      error.statusCodes
    );
  }

  if (error.statusCodes == StatusCodes.PAYMENT_REQUIRED) {
    throw new AppError("Discrepancy in the payment", error.statusCodes);
  }

  if (error.statusCodes == StatusCodes.NOT_FOUND) {
    throw new AppError(
      "For the request you made, there is no bookingId / userId available for payment!",
      error.statusCodes
    );
  }
  throw error;
}
}
async function cancelBooking(bookingId) {
  const transaction = await db.sequelize.transaction();
  try {
    const bookingDetails = await bookingRepository.get(bookingId, transaction);
    console.log(bookingDetails);
    if (bookingDetails.status == CANCELLED) {
      await transaction.commit();
      return true;
    }
    await axios.patch(
      `${ServerConfig.MENU_SERVICE}/api/v1/menu/${bookingDetails.menuId}/quantity`,
      {
        quantity: bookingDetails.quantity,
        dec: 0,
      }
    );
    await bookingRepository.update(
      bookingId,
      { status: CANCELLED },
      transaction
    );
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    if (error.statusCodes == StatusCodes.NOT_FOUND) {
        throw new AppError(
          "For the request you made, there is no bookingId available to cancel!",
          error.statusCodes
        );
      }
      throw new AppError(
        "Sorry! The Cancellation was unsuccessful. Cancellation Service is down",
        StatusCodes.INTERNAL_SERVER_ERROR
      );
  }
}


module.exports = {
  createBooking,
  makePayment,
  cancelBooking
};
