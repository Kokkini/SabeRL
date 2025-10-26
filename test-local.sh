#!/bin/bash

echo "🧪 Testing SabeRL Arena Locally"
echo "================================"

# Test 1: Development version
echo "1. Testing development version..."
npm run dev &
DEV_PID=$!
sleep 3
echo "   ✅ Development server started on http://localhost:8383"
echo "   📝 Open browser and test the game"
echo "   ⏹️  Press Ctrl+C to stop development server"

# Wait for user to stop
wait $DEV_PID

# Test 2: Production build
echo ""
echo "2. Testing production build..."
npm run build
if [ $? -eq 0 ]; then
    echo "   ✅ Build successful"
    echo "   🚀 Starting production server..."
    npm run dev:dist &
    PROD_PID=$!
    sleep 3
    echo "   ✅ Production server started on http://localhost:8384"
    echo "   📝 Open browser and test the production build"
    echo "   ⏹️  Press Ctrl+C to stop production server"
    wait $PROD_PID
else
    echo "   ❌ Build failed"
    exit 1
fi

echo ""
echo "🎉 Testing complete!"
