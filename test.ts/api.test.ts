// Author: Preston Lee

const request = require('supertest');
import { DataSharingCDSHookRequest } from '@asushares/core';
// const assert = require('assert');
// import request from 'supertest';
// import assert from 'assert';
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

describe('GET /cds-services', () => {

    test('it should not choke or query parameters', done => {
        request(app)
            .get('/cds-services?foo=bar&type=valid&crap=null&junk=nil&bad=undefined')
            .expect(200, done);
    });

    test('it should contain at least one service declaration', done => {
        request(app)
            .get('/cds-services')
            .expect((res: any) => {
                // console.log(res.body);
                if (res.body.services.length == 0) {
                    throw new Error("No services provided!");
                } else {
                    for (let n = 0; n < res.body.services.length; n++) {
                        let r = res.body.services[n];
                        if (!r.hook || !r.description || !r.id || !r.title) {
                            throw new Error("Missing FHIR resource property!");
                        }
                    }
                }
            })
            .expect(200, done);
    });

});

describe('POST /cds-services/patient-consent-consult', () => {

    test('it should not accept invalid JSON', done => {
        request(app)
            .post('/cds-services/patient-consent-consult')
            .send('something clearly not going to parse as JSON')
            .expect((res: any) => {
                // console.log(res.aoeu);
            })
            .expect(400, done);
    });

    test('it should not accept', done => {
        let data = new DataSharingCDSHookRequest();
        data.context.patientId =[{value: '2321'}];
        data.context.category = [{system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'patient-privacy'}];
        request(app)
            .post('/cds-services/patient-consent-consult')
            .send(data)
            .expect(200, done)
            // .done();
    });

});
