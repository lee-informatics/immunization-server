# Immunization Server

A Node.js/Express backend API server for the Immunization Dashboard. This server provides RESTful endpoints for managing immunization data, patient information, allergies, and bulk export operations.


## Installation

1. Clone the repository:
```bash
git clone https://github.com/lee-informatics/immunization-server.git
cd immunization-server
```

2. Install dependencies:
```bash
npm install
```

## Environment Variables

Refer to `.env.example` to know which `.env` variables can be configured for runtime


## Development

### Start Development Server

### Build Server

```bash
npm run build
```

### Start Server

```bash
node build/server.js
```

## Docker Deployment

### Build Docker Image

```bash
docker build -t immunization-server .
```

### Run Docker Container

```bash
docker run -p 3000:3000 immunization-server
```

The server will be available at `http://localhost:3000`.


# License

Copyright © 2025 Preston Lee. All rights reserved. Released under the Apache 2.0 license.
