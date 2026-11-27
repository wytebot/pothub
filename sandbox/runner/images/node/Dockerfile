FROM node:22-alpine
RUN apk add --no-cache bash git python3 py3-pip py3-yaml make gcc g++ cmake ruby openjdk17-jdk maven go rust cargo \
  && (apk add --no-cache gradle || true) \
  && (apk add --no-cache php84 php84-cli php84-phar php84-json php84-mbstring php84-xml php84-dom php84-zip php84-curl php84-tokenizer php84-ctype php84-openssl || apk add --no-cache php83 php83-cli php83-phar php83-json php83-mbstring php83-xml php83-dom php83-zip php83-curl php83-tokenizer php83-ctype php83-openssl || true) \
  && (apk add --no-cache composer || true) \
  && npm install --global typescript \
  && pip3 install --break-system-packages --no-cache-dir pytest \
  && mkdir -p /workspace /tmp /home/runner \
  && addgroup -g 1000 runner && adduser -D -u 1000 -G runner runner
COPY pothub-check.sh /usr/local/bin/pothub-check
RUN chmod 755 /usr/local/bin/pothub-check
WORKDIR /workspace
