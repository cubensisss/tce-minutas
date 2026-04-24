# Dockerfile
FROM node:20-bookworm-slim

# Install Python and build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Set up the work directory
WORKDIR /app

# Install Python dependencies first (they change less often)
COPY requirements.txt ./
# Run pip using a virtual environment or directly (override breaking changes logic in python 3.11+)
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# Install Node dependencies
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

# Build the Next.js application
RUN NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co" NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder" npm run build

# Expose port 3000
EXPOSE 3000

# Start Next.js
CMD ["npm", "start"]
