"use strict";
// Author: Preston Lee
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const express_1 = __importDefault(require("express"));
const express_basic_auth_1 = __importDefault(require("express-basic-auth"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const my_version = JSON.parse(fs_1.default.readFileSync(__dirname + '/../package.json').toString()).version;
if (process.env.IMMUNIZATION_FHIR_BASE_URL) {
    console.log('Using IMMUNIZATION_FHIR_BASE_URL ' + process.env.IMMUNIZATION_FHIR_BASE_URL);
}
else {
    console.error('IMMUNIZATION_FHIR_BASE_URL must be set. Exiting, sorry!');
    process.exit(1);
}
if (!process.env.IMMUNIZATION_ADMINISTRATOR_PASSWORD) {
    console.error('IMMUNIZATION_ADMINISTRATOR_PASSWORD must be set. Exiting, sorry!');
    process.exit(1);
}
const app = (0, express_1.default)();
// 
// Errors are not helpful to the user when doing this.
app.use(express_1.default.json({ limit: '100mb' }));
app.use((0, cors_1.default)());
// Root URL
app.get('/', (req, res) => {
    res.json({
        message: "This is a server that is accessed programmatically via HTTP REST calls.",
        datetime: Date.now(),
        version: my_version
    });
});
app.post('/data/example.json', (0, express_basic_auth_1.default)({ users: { administrator: process.env.IMMUNIZATION_ADMINISTRATOR_PASSWORD } }), (req, res) => {
    res.status(200).json({ message: 'Blah blah blah.' });
});
exports.default = app;
