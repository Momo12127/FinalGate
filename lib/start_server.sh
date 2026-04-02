#!/bin/bash

echo "🚀 Starting Product Quality Analysis Server..."
echo "=============================================="

# Check if virtual environment exists
if [ -d "venv" ]; then
    source venv/bin/activate
    echo "✅ Activated virtual environment"
fi

# Check if required packages are installed
echo "📦 Checking dependencies..."
python3 -c "import fastapi, uvicorn, supabase, pillow, httpx" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "⚠️  Installing required packages..."
    pip install fastapi uvicorn python-multipart supabase pillow httpx pydantic
fi

# Check if Ollama is running (for Llama vision)
echo "🤖 Checking Ollama service..."
curl -s http://localhost:11434/api/tags > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Ollama is running"
else
    echo "⚠️  Ollama is not running. Start it with: ollama serve"
fi

# Start the server
echo ""
echo "🌐 Starting FastAPI server on http://localhost:8000"
echo "📝 API Documentation: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop the server"
echo "=============================================="
echo ""

uvicorn app:app --host 0.0.0.0 --port 8000 --reload