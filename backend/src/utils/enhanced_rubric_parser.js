const mammoth = require('mammoth');
const XLSX = require('xlsx');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

/**
 * Convert HTML content to formatted text, preserve paragraph structure
 * @param {string} html - HTML content
 * @returns {string} Formatted text
 */
function convertHtmlToText(html) {
  let text = html;
  
  // Handle paragraph tags - add line breaks between paragraphs
  text = text.replace(/<\/p>\s*<p[^>]*>/gi, '\n');
  text = text.replace(/<p[^>]*>/gi, '');
  text = text.replace(/<\/p>/gi, '');
  
  // Handle line break tags
  text = text.replace(/<br\s*\/?>/gi, '\n');
  
  // Handle list items - add line breaks
  text = text.replace(/<\/li>\s*<li[^>]*>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '');
  text = text.replace(/<\/li>/gi, '');
  
  // Handle other block elements
  text = text.replace(/<\/div>\s*<div[^>]*>/gi, '\n');
  text = text.replace(/<div[^>]*>/gi, '');
  text = text.replace(/<\/div>/gi, '');
  
  // Remove remaining HTML tags
  text = text.replace(/<[^>]*>/g, '');
  
  // Clean up extra whitespace
  text = text.replace(/\n\s*\n/g, '\n'); // Remove extra blank lines
  text = text.replace(/^\s+|\s+$/g, ''); // Remove leading/trailing whitespace
  
  return text;
}

/**
 * Enhanced Rubric parser - extract criterion and grade level detailed information
 * @param {string} filePath - Absolute file path
 * @param {string} mimeType - File MIME type
 * @param {string} originalName - Original filename (optional)
 * @returns {Promise<{rows: number, columns: number, criteria: Array, gradeLevels: Array}>}
 */
async function parseRubricWithDetails(filePath, mimeType, originalName = null) {
  console.log(`🔍 Starting detailed rubric file parsing: ${filePath}`);
  
  try {
    // Prioritize using original filename extension
    const ext = originalName ? 
      path.extname(originalName).toLowerCase() : 
      path.extname(filePath).toLowerCase();
    
    // Choose parsing method based on file type
    if (ext === '.xlsx' || ext === '.xls' || mimeType.includes('spreadsheet')) {
      return await parseExcelRubric(filePath);
    } else if (ext === '.docx' || mimeType.includes('wordprocessingml')) {
      return await parseWordRubric(filePath);
    } else if (ext === '.csv' || mimeType === 'text/csv' || mimeType === 'application/octet-stream') {
      // Check file extension to determine if it's CSV (since MIME type detection is sometimes inaccurate)
      if (ext === '.csv') {
        return await parseCSVRubric(filePath);
      }
    }
    
    // If format cannot be determined, try parsing in priority order
    if (ext === '.csv') {
      return await parseCSVRubric(filePath);
    } else {
      // Try DOCX parsing (.bin files might be DOCX)
      console.log('⚠️ Unable to recognize file format, trying DOCX parsing...');
      return await parseWordRubric(filePath);
    }
  } catch (error) {
    console.error('❌ Failed to parse rubric file in detail:', error);
    return { 
      rows: 0, 
      columns: 0, 
      criteria: [], 
      gradeLevels: [] 
    };
  }
}

/**
 * Parse Word format Rubric
 */
async function parseWordRubric(filePath) {
  console.log('📄 Parsing Word format Rubric...');
  
  try {
    // Extract HTML content for table parsing
    const htmlResult = await mammoth.convertToHtml({ path: filePath });
    const html = htmlResult.value;
    console.log('📝 HTML extraction successful');
    
    // Find tables
    const tableMatches = html.match(/<table[^>]*>[\s\S]*?<\/table>/gi);
    
    if (!tableMatches || tableMatches.length === 0) {
      console.log('⚠️ No tables found');
      return { rows: 0, columns: 0, criteria: [], gradeLevels: [] };
    }
    
    console.log(`🎯 Found ${tableMatches.length} tables, analyzing the first table`);
    
    // Parse the first table
    const table = tableMatches[0];
    const rowMatches = table.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi);
    
    if (!rowMatches || rowMatches.length === 0) {
      console.log('⚠️ No rows in table');
      return { rows: 0, columns: 0, criteria: [], gradeLevels: [] };
    }
    
    console.log(`📊 Table has ${rowMatches.length} rows`);
    
    // Parse table data
    const tableData = [];
    
    for (const row of rowMatches) {
      const cellMatches = row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi);
      if (cellMatches) {
        const rowData = cellMatches.map(cell => {
          // Extract cell text content, preserve paragraph structure
          return convertHtmlToText(cell);
        });
        tableData.push(rowData);
      }
    }
    
    console.log(`✅ Extracted ${tableData.length} rows of data`);
    
    // Analyze table structure and content
    const analysis = analyzeRubricTable(tableData);
    
    return {
      rows: tableData.length,
      columns: tableData[0]?.length || 0,
      criteria: analysis.criteria,
      gradeLevels: analysis.gradeLevels
    };
    
  } catch (error) {
    console.error('❌ Word Rubric parsing failed:', error);
    return { rows: 0, columns: 0, criteria: [], gradeLevels: [] };
  }
}

/**
 * Parse Excel format Rubric
 */
async function parseExcelRubric(filePath) {
  console.log('📈 Parsing Excel format Rubric...');
  
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to 2D array
    const tableData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    console.log(`✅ Extracted ${tableData.length} rows of data`);
    
    // Analyze table structure and content
    const analysis = analyzeRubricTable(tableData);
    
    return {
      rows: tableData.length,
      columns: tableData[0]?.length || 0,
      criteria: analysis.criteria,
      gradeLevels: analysis.gradeLevels
    };
    
  } catch (error) {
    console.error('❌ Excel Rubric parsing failed:', error);
    return { rows: 0, columns: 0, criteria: [], gradeLevels: [] };
  }
}

/**
 * Parse CSV format Rubric
 */
async function parseCSVRubric(filePath) {
  console.log('📋 Parsing CSV format Rubric...');
  
  return new Promise((resolve, reject) => {
    const tableData = [];
    
    fs.createReadStream(filePath)
      .pipe(csv({ headers: false }))
      .on('data', (row) => {
        tableData.push(Object.values(row));
      })
      .on('end', () => {
        console.log(`✅ Extracted ${tableData.length} rows of data`);
        
        // Analyze table structure and content
        const analysis = analyzeRubricTable(tableData);
        
        resolve({
          rows: tableData.length,
          columns: tableData[0]?.length || 0,
          criteria: analysis.criteria,
          gradeLevels: analysis.gradeLevels
        });
      })
      .on('error', reject);
  });
}

/**
 * Analyze Rubric table content, extract criteria and grade levels
 * @param {Array<Array<string>>} tableData - 2D table data
 * @returns {{criteria: Array, gradeLevels: Array}}
 */
function analyzeRubricTable(tableData) {
  console.log('🎯 Starting Rubric table content analysis...');
  
  if (!tableData || tableData.length === 0) {
    return { criteria: [], gradeLevels: [] };
  }
  
  // Assume first row is header
  const headers = tableData[0] || [];
  console.log('📋 Headers:', headers);
  
  // Identify grade level columns (exclude first column criteria and last column score)
  const gradeLevelHeaders = headers.slice(1, -1); // Remove first and last columns
  console.log('🏆 Grade level columns:', gradeLevelHeaders);
  
  const criteria = [];
  const gradeLevels = [];
  
  // Process data rows (skip header)
  for (let i = 1; i < tableData.length; i++) {
    const row = tableData[i];
    if (!row || row.length === 0) continue;
    
    // Extract criterion information
    const criterionName = row[0]?.trim();
    if (!criterionName) continue;
    
    console.log(`\n📍 Processing criterion: ${criterionName}`);
    
    // Find the highest score from all grade level score ranges
    let maxScore = 0;
    
    // Iterate through grade level columns, extract score range for each level, find maximum
    for (let j = 1; j < row.length - 1; j++) { // Skip first column (criterion name) and last column (total score)
      const cellContent = row[j]?.trim() || '';
      if (cellContent) {
        const scoreRange = extractScoreRange(cellContent);
        if (scoreRange) {
          maxScore = Math.max(maxScore, scoreRange.max);
        }
      }
    }
    
    // If no score range found, check if last column has total score
    if (maxScore === 0) {
      const maxScoreText = row[row.length - 1]?.trim() || '';
      if (maxScoreText) {
        maxScore = extractMaxScore(maxScoreText);
      }
    }
    
    // If still no score, use default value
    if (maxScore === 0) {
      maxScore = 15;
    }
    
    console.log(`    📊 Calculated maximum score: ${maxScore}`);
    
    const criterion = {
      seq_no: i, // Sequence number
      title: criterionName,
      description: criterionName, // Can be optimized later
      max_score: maxScore
    };
    
    criteria.push(criterion);
    
    // Extract various levels for this criterion
    for (let j = 1; j < row.length - 1; j++) {
      const cellContent = row[j]?.trim() || '';
      const levelName = gradeLevelHeaders[j - 1]?.trim() || `Level ${j}`;
      
      if (cellContent) {
        console.log(`  🎯 Analyzing level "${levelName}": ${cellContent.substring(0, 100)}...`);
        
        // Extract score range (focus on scores in parentheses)
        const scoreRange = extractScoreRange(cellContent);
        
        if (scoreRange) {
          const gradeLevel = {
            criterion_seq_no: i,
            level_name: levelName,
            min_score: scoreRange.min,
            max_score: scoreRange.max,
            description: cellContent,
            seq_no: j
          };
          
          gradeLevels.push(gradeLevel);
          console.log(`    ✅ Extracted score range: ${scoreRange.min}-${scoreRange.max}`);
        }
      }
    }
  }
  
  console.log(`\n📊 Analysis complete:`);
  console.log(`  - Number of criteria: ${criteria.length}`);
  console.log(`  - Number of levels: ${gradeLevels.length}`);
  
  return { criteria, gradeLevels };
}

/**
 * Extract maximum score from text
 * @param {string} text - Text containing score
 * @returns {number} Maximum score
 */
function extractMaxScore(text) {
  if (!text) return 15; // Default value
  
  console.log(`    🔍 Extracting max_score from: "${text}"`);
  
  // Match "/number" format
  const slashMatch = text.match(/\/(\d+(?:\.\d+)?)/);
  if (slashMatch) {
    const score = parseFloat(slashMatch[1]);
    console.log(`    ✅ Found /number format: ${score}`);
    return score;
  }
  
  // Match "total: number" or similar format
  const totalMatch = text.match(/(?:total|max|total score)[\s:：]*(\d+(?:\.\d+)?)/i);
  if (totalMatch) {
    const score = parseFloat(totalMatch[1]);
    console.log(`    ✅ Found total score format: ${score}`);
    return score;
  }
  
  // Match standalone number (should be the last choice)
  const numberMatch = text.match(/(\d+(?:\.\d+)?)/);
  if (numberMatch) {
    const score = parseFloat(numberMatch[1]);
    console.log(`    ✅ Found number: ${score}`);
    return score;
  }
  
  console.log(`    ⚠️ Unable to extract score, using default value: 15`);
  return 15; // If no score found, use default value
}

/**
 * Extract score range from text (focus on scores in parentheses)
 * @param {string} text - Text containing score information
 * @returns {{min: number, max: number} | null} Score range
 */
function extractScoreRange(text) {
  console.log(`    🔍 Analyzing text: ${text.substring(0, 150)}...`);
  
  // 1. Priority extraction of score ranges in parentheses: (12 – 15 points) or (10.5 – 11.5 points) (only match long dash)
  const bracketRangeMatch = text.match(/\((\d+(?:\.\d+)?)\s*[–]\s*(\d+(?:\.\d+)?)\s*(?:points?)?\)/i);
  if (bracketRangeMatch) {
    const min = parseFloat(bracketRangeMatch[1]);
    const max = parseFloat(bracketRangeMatch[2]);
    console.log(`    📊 Bracket score range: ${min}-${max}`);
    return { min, max };
  }
  
  // 2. Extract single scores in parentheses: (8-10 points) or (4.5-0 point) or (3 - 3.4 points) (support spaced hyphens)
  const bracketSingleMatch = text.match(/\((\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(?:points?|point)?\)/i);
  if (bracketSingleMatch) {
    const num1 = parseFloat(bracketSingleMatch[1]);
    const num2 = parseFloat(bracketSingleMatch[2]);
    
    // Flexible handling: regardless of order, always use smaller number as min, larger as max
    const min = Math.min(num1, num2);
    const max = Math.max(num1, num2);
    
    console.log(`    📊 Bracket score range (format 2): ${min}-${max} (original: ${num1}-${num2})`);
    
    return { min, max };
  }
  
  // 3. Extract leading text score as reference
  const leadingScoreMatch = text.match(/^(\d+(?:\.\d+)?)\s*(?:points?)?\)/i);
  if (leadingScoreMatch) {
    const score = parseFloat(leadingScoreMatch[1]);
    console.log(`    📊 Leading text score: ${score} (as single score)`);
    // For single score, create small range to satisfy database constraint max > min
    const min = Math.max(0, score - 0.1);
    const max = score + 0.1;
    console.log(`    🔧 Single score converted to range: ${min}-${max}`);
    return { min, max };
  }
  
  // 4. Extract any number as fallback
  const anyNumberMatch = text.match(/(\d+(?:\.\d+)?)/);
  if (anyNumberMatch) {
    const score = parseFloat(anyNumberMatch[1]);
    console.log(`    📊 Fallback score: ${score}`);
    // Create small range to satisfy database constraint max > min
    const min = Math.max(0, score - 0.1);
    const max = score + 0.1;
    console.log(`    🔧 Fallback score converted to range: ${min}-${max}`);
    return { min, max };
  }
  
  console.log(`    ❌ No valid score found`);
  return null;
}

module.exports = {
  parseRubricWithDetails,
  analyzeRubricTable,
  extractScoreRange,
  extractMaxScore
};
