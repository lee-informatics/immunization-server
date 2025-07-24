// Author: Preston Lee

import fs from 'fs';
import express from "express";
import basicAuth from 'express-basic-auth';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

const my_version = JSON.parse(fs.readFileSync(__dirname + '/../package.json').toString()).version;

if (process.env.IMMUNIZATION_FHIR_BASE_URL) {
    console.log('Using IMMUNIZATION_FHIR_BASE_URL ' + process.env.IMMUNIZATION_FHIR_BASE_URL);
} else {
    console.error('IMMUNIZATION_FHIR_BASE_URL must be set. Exiting, sorry!');
    process.exit(1);
}
if (!process.env.IMMUNIZATION_ADMINISTRATOR_PASSWORD) {
    console.error('IMMUNIZATION_ADMINISTRATOR_PASSWORD must be set. Exiting, sorry!');
    process.exit(1);
}
const app = express();
// 
// Errors are not helpful to the user when doing this.
app.use(express.json({ limit: '100mb' }));
app.use(cors());


// Root URL
app.get('/', (req, res) => {
    res.json({
        message: "This is a server that is accessed programmatically via HTTP REST calls.",
        datetime: Date.now(),
        version: my_version
    });
});

app.post('/data/example.json', basicAuth({ users: { administrator: process.env.IMMUNIZATION_ADMINISTRATOR_PASSWORD } }), (req, res) => {
    res.status(200).json({ message: 'Blah blah blah.' });
});

export default app;
