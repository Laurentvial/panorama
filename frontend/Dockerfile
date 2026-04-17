# Panorama Frontend - React + Vite for Coolify deployment
# Multi-stage: Node for build, nginx for serve

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Build args for API URL (baked into frontend at build time)
ARG VITE_URL=http://127.0.0.1:8000
ARG VITE_API_URL
ENV VITE_URL=${VITE_URL}
ENV VITE_API_URL=${VITE_API_URL:-$VITE_URL}

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# Copy source and build
COPY . .
RUN npm run build

# Serve stage
FROM nginx:alpine

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# SPA fallback: serve index.html for all routes
RUN cat > /etc/nginx/conf.d/default.conf <<'EOF'
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
