FROM python:3.12-slim

WORKDIR /app

# Install Python dependencies
COPY app/requirements.txt /app/
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy application code
COPY . .

# Create a non-root user
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser && \
    chown -R appuser:appgroup /app

USER appuser

# Expose port
EXPOSE 8000

# Run commands
# Using uvicorn directly for production is okay, but gunicorn with uvicorn workers is often recommended.
# For simplicity and given the context, uvicorn is fine, but let's bind to 0.0.0.0.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
