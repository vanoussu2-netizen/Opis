#!/bin/bash
set -e

echo "======================================"
echo "USO Teeth Calculator - Build Script"
echo "======================================"

cd "$(dirname "$0")"

minify_js() {
    local input="$1"
    local output="$2"
    echo "  Minifying $(basename "$input")..."
    npx -y terser "$input" --compress --mangle --output "$output" 2>&1 | grep -v "npm WARN" || true
}

minify_css() {
    local input="$1"
    local output="$2"
    echo "  Minifying $(basename "$input")..."
    npx -y clean-css-cli -o "$output" "$input" 2>&1 | grep -v "npm WARN" | grep -v "deprecated" || true
}

echo ""
echo "Step 1: Minifying JavaScript files"
minify_js "js/uso.canvas.js" "js/uso.canvas.min.js"
minify_js "js/uso.app.js" "js/uso.app.min.js"
minify_js "js/uso.export.js" "js/uso.export.min.js"
minify_js "js/uso.calc.js" "js/uso.calc.min.js"
minify_js "js/uso.state.js" "js/uso.state.min.js"

echo ""
echo "Step 2: Minifying CSS files"
minify_css "public.css" "public.min.css"

echo ""
echo "Step 3: Checking syntax"
for file in js/*.min.js; do
    echo "  Checking $(basename "$file")..."
    node -c "$file"
done

echo ""
echo "======================================"
echo "Build completed successfully!"
echo "======================================"
echo ""
echo "JavaScript files:"
ls -lh js/*.min.js | awk '{print "  " $9 " - " $5}'
echo ""
echo "CSS files:"
ls -lh *.min.css 2>/dev/null | awk '{print "  " $9 " - " $5}' || echo "  No CSS files found"
echo ""
