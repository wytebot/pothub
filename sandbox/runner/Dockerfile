FROM node:22-alpine
WORKDIR /srv/pothub-runner
COPY package.json tsconfig.json ./
RUN npm install --no-audit --no-fund
COPY src ./src
ENV NODE_ENV=production PORT=8788
EXPOSE 8788
CMD ["npm", "start"]
