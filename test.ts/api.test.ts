// Author: Preston Lee

const request = require('supertest');
// import supertest from "@types/supertest";

import app from '../src/api';
// import { PatientConsentHookRequest } from '@asushares/core';

describe('GET /', () => {

    test('it should return a JSON status document', done => {
        request(app)
            .get('/')
            .expect('Content-Type', 'application/json; charset=utf-8')
            .expect((res: any) => {
                if (!res.body.message) {
                    throw new Error("Document didn't include expected properties");
                }
                if (res.body.datetime <= 0) {
                    throw new Error("Timestamp field 'datetime' not present");
                }
            })
            .expect(200, done);
    });

});
