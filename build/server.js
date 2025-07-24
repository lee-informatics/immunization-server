"use strict";
// Author: Preston Lee
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = __importDefault(require("./api"));
const port = 3000;
api_1.default.listen(port, () => {
    console.log('The CDS Hooks server is now listening on port ' + port + '. Yay.');
});
