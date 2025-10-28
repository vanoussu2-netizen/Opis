#!/bin/bash
set -e

echo "=========================================="
echo "USO Teeth Calculator - Release Builder"
echo "=========================================="

cd "$(dirname "$0")"
VERSION=$(grep "Version:" uso-teeth-calculator.php | head -1 | sed -E 's/.*Version:\s*([0-9.]+).*/\1/')
OUTPUT_ZIP="../uso-teeth-calculator-v${VERSION}.zip"
TEMP_DIR="/tmp/uso-release-$$"

echo ""
echo "Version: $VERSION"
echo "Output: $OUTPUT_ZIP"
echo ""

# Проверяем минифицированные файлы
if [ ! -f "js/uso.canvas.min.js" ]; then
    echo "ERROR: Minified files not found. Run ./build.sh first!"
    exit 1
fi
echo "✓ Minified files found"

# Создаем временную директорию
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR/uso-teeth-calculator"
echo "✓ Temporary directory created"

# Копируем файлы
echo ""
echo "Copying files..."

# Основные файлы
cp uso-teeth-calculator.php "$TEMP_DIR/uso-teeth-calculator/"
cp README.md "$TEMP_DIR/uso-teeth-calculator/" 2>/dev/null || true
cp OPTIMIZATION_REPORT.md "$TEMP_DIR/uso-teeth-calculator/" 2>/dev/null || true
cp public.css public.min.css "$TEMP_DIR/uso-teeth-calculator/"

# JS директория
mkdir -p "$TEMP_DIR/uso-teeth-calculator/js"
for file in js/uso.*.js js/uso.*.min.js; do
    [ -f "$file" ] && cp "$file" "$TEMP_DIR/uso-teeth-calculator/js/"
done

# Templates
mkdir -p "$TEMP_DIR/uso-teeth-calculator/templates"
[ -d "templates" ] && cp -r templates/* "$TEMP_DIR/uso-teeth-calculator/templates/" 2>/dev/null || true

# Vendor
mkdir -p "$TEMP_DIR/uso-teeth-calculator/vendor"
[ -d "vendor" ] && cp vendor/*.{js,ttf} "$TEMP_DIR/uso-teeth-calculator/vendor/" 2>/dev/null || true

echo "✓ Files copied"

# Статистика
FILE_COUNT=$(find "$TEMP_DIR/uso-teeth-calculator" -type f | wc -l)
TOTAL_SIZE=$(du -sh "$TEMP_DIR/uso-teeth-calculator" | awk '{print $1}')
echo ""
echo "Files: $FILE_COUNT"
echo "Size: $TOTAL_SIZE"

# Создаем ZIP
echo ""
echo "Creating ZIP archive..."
cd "$TEMP_DIR"
zip -r -q "$OUTPUT_ZIP" "uso-teeth-calculator"
cd - > /dev/null

ZIP_SIZE=$(ls -lh "$OUTPUT_ZIP" | awk '{print $5}')
echo "✓ ZIP created: $ZIP_SIZE"

# Очистка
rm -rf "$TEMP_DIR"

echo ""
echo "=========================================="
echo "✓ Release build completed!"
echo "=========================================="
echo ""
echo "File: $OUTPUT_ZIP"
echo "Size: $ZIP_SIZE"
echo ""
