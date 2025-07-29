FROM node:24-alpine
LABEL maintainer="Preston Lee"

RUN mkdir /app
WORKDIR /app

# Create the dependency layer first.
COPY package.json package-lock.json ./
RUN npm install

# Copy our faster-moving source code and build it.
COPY tsconfig.json ./
COPY src src
RUN npm run build
RUN rm -rf src/

# Image defaults for local development and testing. This will be overridden by environment variables in production.
ENV IMMUNIZATION_SERVER_MONGODB_HOST=localhost
ENV IMMUNIZATION_SERVER_MONGODB_PORT=27017
ENV IMMUNIZATION_SERVER_MONGODB_DATABASE=immunization-dashboard
ENV IMMUNIZATION_SERVER_MONGODB_USERNAME=root
ENV IMMUNIZATION_SERVER_MONGODB_PASSWORD=password

# Run express as-is
EXPOSE 3000
CMD ["node", "build/server.js"]
