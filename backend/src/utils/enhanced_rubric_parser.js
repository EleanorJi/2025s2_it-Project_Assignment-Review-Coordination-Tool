const mammoth = require('mammoth');
const XLSX = require('xlsx');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

/**
 * 将HTML内容转换为格式化的文本，保留段落结构
 * @param {string} html - HTML内容
 * @returns {string} 格式化的文本
 */
function convertHtmlToText(html) {
  let text = html;
  
  // 处理段落标签 - 在段落之间添加换行
  text = text.replace(/<\/p>\s*<p[^>]*>/gi, '\n');
  text = text.replace(/<p[^>]*>/gi, '');
  text = text.replace(/<\/p>/gi, '');
  
  // 处理换行标签
  text = text.replace(/<br\s*\/?>/gi, '\n');
  
  // 处理列表项 - 添加换行
  text = text.replace(/<\/li>\s*<li[^>]*>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '');
  text = text.replace(/<\/li>/gi, '');
  
  // 处理其他块级元素
  text = text.replace(/<\/div>\s*<div[^>]*>/gi, '\n');
  text = text.replace(/<div[^>]*>/gi, '');
  text = text.replace(/<\/div>/gi, '');
  
  // 移除剩余的HTML标签
  text = text.replace(/<[^>]*>/g, '');
  
  // 清理多余的空白字符
  text = text.replace(/\n\s*\n/g, '\n'); // 移除多余的空行
  text = text.replace(/^\s+|\s+$/g, ''); // 移除首尾空白
  
  return text;
}

/**
 * 增强的Rubric解析器 - 提取criterion和grade level详细信息
 * @param {string} filePath - 文件的绝对路径
 * @param {string} mimeType - 文件的MIME类型
 * @param {string} originalName - 原始文件名（可选）
 * @returns {Promise<{rows: number, columns: number, criteria: Array, gradeLevels: Array}>}
 */
async function parseRubricWithDetails(filePath, mimeType, originalName = null) {
  console.log(`🔍 开始详细解析rubric文件: ${filePath}`);
  
  try {
    // 优先使用原始文件名的扩展名
    const ext = originalName ? 
      path.extname(originalName).toLowerCase() : 
      path.extname(filePath).toLowerCase();
    
    // 根据文件类型选择解析方法
    if (ext === '.xlsx' || ext === '.xls' || mimeType.includes('spreadsheet')) {
      return await parseExcelRubric(filePath);
    } else if (ext === '.docx' || mimeType.includes('wordprocessingml')) {
      return await parseWordRubric(filePath);
    } else if (ext === '.csv' || mimeType === 'text/csv' || mimeType === 'application/octet-stream') {
      // 检查文件扩展名来判断是否为CSV (因为有时MIME类型检测不准确)
      if (ext === '.csv') {
        return await parseCSVRubric(filePath);
      }
    }
    
    // 如果无法确定格式，尝试按优先级解析
    if (ext === '.csv') {
      return await parseCSVRubric(filePath);
    } else {
      // 尝试DOCX解析（.bin文件可能是DOCX）
      console.log('⚠️ 无法识别文件格式，尝试DOCX解析...');
      return await parseWordRubric(filePath);
    }
  } catch (error) {
    console.error('❌ 详细解析rubric文件失败:', error);
    return { 
      rows: 0, 
      columns: 0, 
      criteria: [], 
      gradeLevels: [] 
    };
  }
}

/**
 * 解析Word格式的Rubric
 */
async function parseWordRubric(filePath) {
  console.log('📄 解析Word格式Rubric...');
  
  try {
    // 提取HTML内容以便解析表格
    const htmlResult = await mammoth.convertToHtml({ path: filePath });
    const html = htmlResult.value;
    console.log('📝 提取HTML成功');
    
    // 查找表格
    const tableMatches = html.match(/<table[^>]*>[\s\S]*?<\/table>/gi);
    
    if (!tableMatches || tableMatches.length === 0) {
      console.log('⚠️ 未找到表格');
      return { rows: 0, columns: 0, criteria: [], gradeLevels: [] };
    }
    
    console.log(`🎯 发现 ${tableMatches.length} 个表格，分析第一个表格`);
    
    // 解析第一个表格
    const table = tableMatches[0];
    const rowMatches = table.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi);
    
    if (!rowMatches || rowMatches.length === 0) {
      console.log('⚠️ 表格中没有行');
      return { rows: 0, columns: 0, criteria: [], gradeLevels: [] };
    }
    
    console.log(`📊 表格有 ${rowMatches.length} 行`);
    
    // 解析表格数据
    const tableData = [];
    
    for (const row of rowMatches) {
      const cellMatches = row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi);
      if (cellMatches) {
        const rowData = cellMatches.map(cell => {
          // 提取单元格文本内容，保留段落结构
          return convertHtmlToText(cell);
        });
        tableData.push(rowData);
      }
    }
    
    console.log(`✅ 提取到 ${tableData.length} 行数据`);
    
    // 分析表格结构和内容
    const analysis = analyzeRubricTable(tableData);
    
    return {
      rows: tableData.length,
      columns: tableData[0]?.length || 0,
      criteria: analysis.criteria,
      gradeLevels: analysis.gradeLevels
    };
    
  } catch (error) {
    console.error('❌ Word Rubric解析失败:', error);
    return { rows: 0, columns: 0, criteria: [], gradeLevels: [] };
  }
}

/**
 * 解析Excel格式的Rubric
 */
async function parseExcelRubric(filePath) {
  console.log('📈 解析Excel格式Rubric...');
  
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // 转换为二维数组
    const tableData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    console.log(`✅ 提取到 ${tableData.length} 行数据`);
    
    // 分析表格结构和内容
    const analysis = analyzeRubricTable(tableData);
    
    return {
      rows: tableData.length,
      columns: tableData[0]?.length || 0,
      criteria: analysis.criteria,
      gradeLevels: analysis.gradeLevels
    };
    
  } catch (error) {
    console.error('❌ Excel Rubric解析失败:', error);
    return { rows: 0, columns: 0, criteria: [], gradeLevels: [] };
  }
}

/**
 * 解析CSV格式的Rubric
 */
async function parseCSVRubric(filePath) {
  console.log('📋 解析CSV格式Rubric...');
  
  return new Promise((resolve, reject) => {
    const tableData = [];
    
    fs.createReadStream(filePath)
      .pipe(csv({ headers: false }))
      .on('data', (row) => {
        tableData.push(Object.values(row));
      })
      .on('end', () => {
        console.log(`✅ 提取到 ${tableData.length} 行数据`);
        
        // 分析表格结构和内容
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
 * 分析Rubric表格内容，提取criteria和grade levels
 * @param {Array<Array<string>>} tableData - 二维表格数据
 * @returns {{criteria: Array, gradeLevels: Array}}
 */
function analyzeRubricTable(tableData) {
  console.log('🎯 开始分析Rubric表格内容...');
  
  if (!tableData || tableData.length === 0) {
    return { criteria: [], gradeLevels: [] };
  }
  
  // 假设第一行是表头
  const headers = tableData[0] || [];
  console.log('📋 表头:', headers);
  
  // 识别等级列（排除第一列criteria和最后一列score）
  const gradeLevelHeaders = headers.slice(1, -1); // 去掉第一列和最后一列
  console.log('🏆 等级列:', gradeLevelHeaders);
  
  const criteria = [];
  const gradeLevels = [];
  
  // 处理数据行（跳过表头）
  for (let i = 1; i < tableData.length; i++) {
    const row = tableData[i];
    if (!row || row.length === 0) continue;
    
    // 提取criterion信息
    const criterionName = row[0]?.trim();
    if (!criterionName) continue;
    
    console.log(`\n📍 处理标准: ${criterionName}`);
    
    // 从所有等级的分数区间中找到最高分数
    let maxScore = 0;
    
    // 遍历等级列，提取每个等级的分数区间，找到最大值
    for (let j = 1; j < row.length - 1; j++) { // 跳过第一列(标准名)和最后一列(总分列)
      const cellContent = row[j]?.trim() || '';
      if (cellContent) {
        const scoreRange = extractScoreRange(cellContent);
        if (scoreRange) {
          maxScore = Math.max(maxScore, scoreRange.max);
        }
      }
    }
    
    // 如果没有找到分数区间，检查最后一列是否有总分
    if (maxScore === 0) {
      const maxScoreText = row[row.length - 1]?.trim() || '';
      if (maxScoreText) {
        maxScore = extractMaxScore(maxScoreText);
      }
    }
    
    // 如果仍然没有分数，使用默认值
    if (maxScore === 0) {
      maxScore = 15;
    }
    
    console.log(`    📊 计算得出最高分数: ${maxScore}`);
    
    const criterion = {
      seq_no: i, // 序号
      title: criterionName,
      description: criterionName, // 可以后续优化
      max_score: maxScore
    };
    
    criteria.push(criterion);
    
    // 提取该criterion的各个等级
    for (let j = 1; j < row.length - 1; j++) {
      const cellContent = row[j]?.trim() || '';
      const levelName = gradeLevelHeaders[j - 1]?.trim() || `Level ${j}`;
      
      if (cellContent) {
        console.log(`  🎯 分析等级 "${levelName}": ${cellContent.substring(0, 100)}...`);
        
        // 提取分数区间（重点关注括号中的分数）
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
          console.log(`    ✅ 提取分数区间: ${scoreRange.min}-${scoreRange.max}`);
        }
      }
    }
  }
  
  console.log(`\n📊 分析完成:`);
  console.log(`  - 标准数量: ${criteria.length}`);
  console.log(`  - 等级数量: ${gradeLevels.length}`);
  
  return { criteria, gradeLevels };
}

/**
 * 从文本中提取最大分数
 * @param {string} text - 包含分数的文本
 * @returns {number} 最大分数
 */
function extractMaxScore(text) {
  if (!text) return 15; // 默认值
  
  console.log(`    🔍 提取max_score from: "${text}"`);
  
  // 匹配 "/数字" 格式
  const slashMatch = text.match(/\/(\d+(?:\.\d+)?)/);
  if (slashMatch) {
    const score = parseFloat(slashMatch[1]);
    console.log(`    ✅ 发现 /数字 格式: ${score}`);
    return score;
  }
  
  // 匹配 "总分: 数字" 或类似格式
  const totalMatch = text.match(/(?:总分|total|max|满分)[\s:：]*(\d+(?:\.\d+)?)/i);
  if (totalMatch) {
    const score = parseFloat(totalMatch[1]);
    console.log(`    ✅ 发现总分格式: ${score}`);
    return score;
  }
  
  // 匹配单独的数字（应该是最后的选择）
  const numberMatch = text.match(/(\d+(?:\.\d+)?)/);
  if (numberMatch) {
    const score = parseFloat(numberMatch[1]);
    console.log(`    ✅ 发现数字: ${score}`);
    return score;
  }
  
  console.log(`    ⚠️ 无法提取分数，使用默认值: 15`);
  return 15; // 如果找不到分数，使用默认值
}

/**
 * 从文本中提取分数区间（重点关注括号中的分数）
 * @param {string} text - 包含分数信息的文本
 * @returns {{min: number, max: number} | null} 分数区间
 */
function extractScoreRange(text) {
  console.log(`    🔍 分析文本: ${text.substring(0, 150)}...`);
  
  // 1. 优先提取括号中的分数区间：(12 – 15 points) 或 (10.5 – 11.5 points) (只匹配长破折号)
  const bracketRangeMatch = text.match(/\((\d+(?:\.\d+)?)\s*[–]\s*(\d+(?:\.\d+)?)\s*(?:points?|分)?\)/i);
  if (bracketRangeMatch) {
    const min = parseFloat(bracketRangeMatch[1]);
    const max = parseFloat(bracketRangeMatch[2]);
    console.log(`    📊 括号分数区间: ${min}-${max}`);
    return { min, max };
  }
  
  // 2. 提取括号中的单一分数：(8-10 points) 或 (4.5-0 point) 或 (3 - 3.4 points) (支持有空格的短横线)
  const bracketSingleMatch = text.match(/\((\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(?:points?|point|分)?\)/i);
  if (bracketSingleMatch) {
    const num1 = parseFloat(bracketSingleMatch[1]);
    const num2 = parseFloat(bracketSingleMatch[2]);
    
    // 灵活处理：不管顺序如何，总是将小的数字作为min，大的数字作为max
    const min = Math.min(num1, num2);
    const max = Math.max(num1, num2);
    
    console.log(`    📊 括号分数区间(格式2): ${min}-${max} (原始: ${num1}-${num2})`);
    
    return { min, max };
  }
  
  // 3. 提取文本开头的分数作为参考
  const leadingScoreMatch = text.match(/^(\d+(?:\.\d+)?)\s*(?:points?|分)/i);
  if (leadingScoreMatch) {
    const score = parseFloat(leadingScoreMatch[1]);
    console.log(`    📊 文本开头分数: ${score} (作为单一分数)`);
    // 对于单一分数，创建一个小范围以满足数据库约束 max > min
    const min = Math.max(0, score - 0.1);
    const max = score + 0.1;
    console.log(`    🔧 单一分数转换为区间: ${min}-${max}`);
    return { min, max };
  }
  
  // 4. 提取任何数字作为备选
  const anyNumberMatch = text.match(/(\d+(?:\.\d+)?)/);
  if (anyNumberMatch) {
    const score = parseFloat(anyNumberMatch[1]);
    console.log(`    📊 备选分数: ${score}`);
    // 创建一个小范围以满足数据库约束 max > min
    const min = Math.max(0, score - 0.1);
    const max = score + 0.1;
    console.log(`    🔧 备选分数转换为区间: ${min}-${max}`);
    return { min, max };
  }
  
  console.log(`    ❌ 未找到有效分数`);
  return null;
}

module.exports = {
  parseRubricWithDetails,
  analyzeRubricTable,
  extractScoreRange,
  extractMaxScore
};
