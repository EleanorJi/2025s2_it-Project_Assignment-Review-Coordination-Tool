const XLSX = require('xlsx');
const mammoth = require('mammoth');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

/**
 * Parse different format rubric files, extract table row and column count
 * @param {string} filePath - Absolute file path
 * @param {string} mimeType - File MIME type
 * @returns {Promise<{rows: number, columns: number}>}
 */
async function parseRubricFile(filePath, mimeType) {
  console.log(`📊 Starting rubric file parsing: ${filePath}, MIME type: ${mimeType}`);
  
  try {
    const ext = path.extname(filePath).toLowerCase();
    
    // Choose parsing method based on file extension and MIME type
    if (ext === '.xlsx' || ext === '.xls' || mimeType.includes('spreadsheet')) {
      return await parseExcelFile(filePath);
    } else if (ext === '.docx' || mimeType.includes('wordprocessingml')) {
      return await parseWordFile(filePath);
    } else if (ext === '.csv' || mimeType === 'text/csv') {
      return await parseCSVFile(filePath);
    } else {
      // If format cannot be recognized, try DOCX parsing first (since .bin files might be DOCX)
      console.log('⚠️ Cannot recognize file format, trying various parsing methods...');
      
      // Try all formats in sequence and collect all results
      const results = [];
      
      try {
        console.log('🔄 Trying DOCX parsing...');
        const docxResult = await parseWordFile(filePath);
        results.push({ type: 'DOCX', ...docxResult });
        if (docxResult.rows > 0 && docxResult.columns > 0) {
          return docxResult;
        }
      } catch (docxError) {
        console.log('❌ DOCX parsing failed:', docxError.message);
      }
      
      try {
        console.log('🔄 Trying Excel parsing...');
        const excelResult = await parseExcelFile(filePath);
        results.push({ type: 'Excel', ...excelResult });
        if (excelResult.rows > 0 && excelResult.columns > 0) {
          return excelResult;
        }
      } catch (excelError) {
        console.log('❌ Excel parsing failed:', excelError.message);
      }
      
      try {
        console.log('🔄 Trying CSV parsing...');
        const csvResult = await parseCSVFile(filePath);
        results.push({ type: 'CSV', ...csvResult });
        if (csvResult.rows > 0 && csvResult.columns > 0) {
          return csvResult;
        }
      } catch (csvError) {
        console.log('❌ CSV parsing failed:', csvError.message);
      }
      
      // If all methods failed, select the best result
      const bestResult = results.reduce((best, current) => {
        const currentScore = current.rows * current.columns;
        const bestScore = best.rows * best.columns;
        return currentScore > bestScore ? current : best;
      }, { rows: 0, columns: 0 });
      
      console.log('🔍 All parsing results:', results);
      console.log('🎯 Selected best result:', bestResult);
      return { rows: bestResult.rows || 0, columns: bestResult.columns || 0 };
    }
  } catch (error) {
    console.error('❌ Failed to parse rubric file:', error);
    // Return default values
    return { rows: 0, columns: 0 };
  }
}

/**
 * Parse Excel files (.xlsx, .xls)
 */
async function parseExcelFile(filePath) {
  console.log('📈 Parsing Excel file...');
  
  try {
    const workbook = XLSX.readFile(filePath, { type: 'file' });
    const sheetNames = workbook.SheetNames;
    
    console.log(`📋 Found ${sheetNames.length} worksheets:`, sheetNames);
    
    if (sheetNames.length === 0) {
      console.log('⚠️ No worksheets in Excel file');
      return { rows: 0, columns: 0 };
    }
    
    // Take first worksheet
    const firstSheetName = sheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    if (!worksheet || !worksheet['!ref']) {
      console.log('⚠️ Worksheet is empty or has no data');
      return { rows: 0, columns: 0 };
    }
    
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    const rows = range.e.r + 1; // Row count (0-based to 1-based)
    const columns = range.e.c + 1; // Column count (0-based to 1-based)
    
    // Validate if there's actual data
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    const nonEmptyRows = jsonData.filter(row => row.some(cell => cell !== undefined && cell !== null && cell !== ''));
    
    const actualRows = nonEmptyRows.length;
    const actualColumns = Math.max(...nonEmptyRows.map(row => row.length));
    
    console.log(`📊 Excel file information:`);
    console.log(`  - Worksheet: ${firstSheetName}`);
    console.log(`  - Original range: ${worksheet['!ref']}`);
    console.log(`  - Range parsed: ${rows} rows x ${columns} columns`);
    console.log(`  - Actual data: ${actualRows} rows x ${actualColumns} columns`);
    
    const finalRows = Math.max(actualRows, rows);
    const finalColumns = Math.max(actualColumns, columns);
    
    console.log(`✅ Excel parsing complete: ${finalRows} rows x ${finalColumns} columns`);
    return { rows: finalRows, columns: finalColumns };
    
  } catch (error) {
    console.error('❌ Excel parsing detailed error:', error.message);
    throw error;
  }
}

/**
 * Parse Word files (.docx)
 */
async function parseWordFile(filePath) {
  console.log('📄 Parsing Word file...');
  
  try {
    // Try to extract HTML format, easier to identify tables
    const htmlResult = await mammoth.convertToHtml({ path: filePath });
    const html = htmlResult.value;
    console.log('📝 Extracted HTML content preview:', html.substring(0, 200) + '...');
    
    // Check if it contains tables
    const tableMatches = html.match(/<table[^>]*>[\s\S]*?<\/table>/gi);
    
    if (tableMatches && tableMatches.length > 0) {
      console.log(`🎯 Found ${tableMatches.length} tables`);
      
      // Analyze first table
      const firstTable = tableMatches[0];
      const rowMatches = firstTable.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi);
      let maxColumns = 0;
      
      if (rowMatches) {
        for (const row of rowMatches) {
          const cellMatches = row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi);
          if (cellMatches) {
            maxColumns = Math.max(maxColumns, cellMatches.length);
          }
        }
        
        console.log(`✅ Word table parsing complete: ${rowMatches.length} rows x ${maxColumns} columns`);
        return { rows: rowMatches.length, columns: maxColumns };
      }
    }
    
    // If no tables found, try text analysis
    const textResult = await mammoth.extractRawText({ path: filePath });
    const text = textResult.value;
    console.log('📝 Extracted text content preview:', text.substring(0, 200) + '...');
    
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    
    if (lines.length === 0) {
      console.log('⚠️ No content in Word file');
      return { rows: 0, columns: 0 };
    }
    
    // Analyze text structure
    let maxColumns = 0;
    let tableRows = 0;
    
    for (const line of lines) {
      // Look for tabs, multiple spaces, or special separators
      const separators = [
        /\t/g,           // Tab
        /\s{2,}/g,       // Two or more spaces
        /\|/g,           // Pipe separator
        /,/g             // Comma separator
      ];
      
      for (const separator of separators) {
        const matches = line.match(separator);
        if (matches && matches.length > 0) {
          const columnCount = matches.length + 1;
          if (columnCount > 1) {
            maxColumns = Math.max(maxColumns, columnCount);
            tableRows++;
            break; // Break loop when separator found
          }
        }
      }
    }
    
    // If still no table structure detected, use default values
    if (maxColumns === 0) {
      // Check if there are keywords indicating this is a rubric
      const rubricKeywords = ['criteria', 'score', 'points', 'excellent', 'good', 'fair', 'poor', 'outstanding', 'satisfactory', 'average', 'below average', 'scoring', 'standard'];
      const hasRubricKeywords = rubricKeywords.some(keyword => text.toLowerCase().includes(keyword.toLowerCase()));
      
      if (hasRubricKeywords) {
        // If contains rubric keywords, estimate a reasonable table size
        maxColumns = 4; // Usually rubrics have 4-5 columns (criteria, excellent, good, fair, poor)
        tableRows = Math.min(Math.max(lines.length, 3), 10); // At least 3 rows, at most 10 rows
      } else {
        maxColumns = 2;
        tableRows = Math.min(lines.length, 5);
      }
    }
    
    console.log(`✅ Word parsing complete: ${tableRows} rows x ${maxColumns} columns`);
    return { rows: tableRows, columns: maxColumns };
    
  } catch (error) {
    console.error('❌ Word file parsing failed:', error);
    return { rows: 0, columns: 0 };
  }
}

/**
 * Parse CSV files
 */
async function parseCSVFile(filePath) {
  console.log('📋 Parsing CSV file...');
  
  return new Promise((resolve, reject) => {
    const rows = [];
    let maxColumns = 0;
    
    fs.createReadStream(filePath)
      .pipe(csv({ headers: false })) // Don't use first row as headers
      .on('data', (row) => {
        const columnCount = Object.keys(row).length;
        maxColumns = Math.max(maxColumns, columnCount);
        rows.push(row);
      })
      .on('end', () => {
        console.log(`✅ CSV parsing complete: ${rows.length} rows x ${maxColumns} columns`);
        resolve({ rows: rows.length, columns: maxColumns });
      })
      .on('error', (error) => {
        console.error('❌ CSV parsing failed:', error);
        reject(error);
      });
  });
}

module.exports = {
  parseRubricFile
};
