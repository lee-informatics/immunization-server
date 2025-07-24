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

# Run express as-is
EXPOSE 3000
CMD ["node", "build/server.js"]
