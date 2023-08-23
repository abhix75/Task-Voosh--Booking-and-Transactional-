const dotenv = require('dotenv');

dotenv.config();

module.exports = {
    PORT: process.env.PORT,
    MENU_SERVICE: process.env.MENU_SERVICE
}