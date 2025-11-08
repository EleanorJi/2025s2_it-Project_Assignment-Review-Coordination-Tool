const XLSX = require('xlsx');
const mammoth = require('mammoth');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

/**
 * 解析不同格式的rubric文件，提取表格的行列数量
 * @param {string} filePath - 文件的绝对路径
 * @param {string} mimeType - 文件的MIME类型
 * @returns {Promise<{rows: number, columns: number}>}
 */
async function parseRubricFile(filePath, mimeType) {
  console.log(`📊 开始解析rubric文件: ${filePath}, MIME类型: ${mimeType}`);
  
  try {
    const ext = path.extname(filePath).toLowerCase();
    
    // 根据文件扩展名和MIME类型选择解析方法
    if (ext === '.xlsx' || ext === '.xls' || mimeType.includes('spreadsheet')) {
      return await parseExcelFile(filePath);
    } else if (ext === '.docx' || mimeType.includes('wordprocessingml')) {
      return await parseWordFile(filePath);
    } else if (ext === '.csv' || mimeType === 'text/csv') {
      return await parseCSVFile(filePath);
    } else {
      // 如果无法识别格式，优先尝试DOCX解析（因为.bin文件可能是DOCX）
      console.log('⚠️ 无法识别文件格式，依次尝试各种解析方法...');
      
      // 依次尝试所有格式，并收集所有结果
      const results = [];
      
      try {
        console.log('🔄 尝试DOCX解析...');
        const docxResult = await parseWordFile(filePath);
        results.push({ type: 'DOCX', ...docxResult });
        if (docxResult.rows > 0 && docxResult.columns > 0) {
          return docxResult;
        }
      } catch (docxError) {
        console.log('❌ DOCX解析失败:', docxError.message);
      }
      
      try {
        console.log('🔄 尝试Excel解析...');
        const excelResult = await parseExcelFile(filePath);
        results.push({ type: 'Excel', ...excelResult });
        if (excelResult.rows > 0 && excelResult.columns > 0) {
          return excelResult;
        }
      } catch (excelError) {
        console.log('❌ Excel解析失败:', excelError.message);
      }
      
      try {
        console.log('🔄 尝试CSV解析...');
        const csvResult = await parseCSVFile(filePath);
        results.push({ type: 'CSV', ...csvResult });
        if (csvResult.rows > 0 && csvResult.columns > 0) {
          return csvResult;
        }
      } catch (csvError) {
        console.log('❌ CSV解析失败:', csvError.message);
      }
      
      // 如果所有方法都失败了，选择结果最好的
      const bestResult = results.reduce((best, current) => {
        const currentScore = current.rows * current.columns;
        const bestScore = best.rows * best.columns;
        return currentScore > bestScore ? current : best;
      }, { rows: 0, columns: 0 });
      
      console.log('🔍 所有解析结果:', results);
      console.log('🎯 选择最佳结果:', bestResult);
      return { rows: bestResult.rows || 0, columns: bestResult.columns || 0 };
    }
  } catch (error) {
    console.error('❌ 解析rubric文件失败:', error);
    // 返回默认值
    return { rows: 0, columns: 0 };
  }
}

/**
 * 解析Excel文件 (.xlsx, .xls)
 */
async function parseExcelFile(filePath) {
  console.log('📈 解析Excel文件...');
  
  try {
    const workbook = XLSX.readFile(filePath, { type: 'file' });
    const sheetNames = workbook.SheetNames;
    
    console.log(`📋 发现 ${sheetNames.length} 个工作表:`, sheetNames);
    
    if (sheetNames.length === 0) {
      console.log('⚠️ Excel文件中没有工作表');
      return { rows: 0, columns: 0 };
    }
    
    // 取第一个工作表
    const firstSheetName = sheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    if (!worksheet || !worksheet['!ref']) {
      console.log('⚠️ 工作表为空或没有数据');
      return { rows: 0, columns: 0 };
    }
    
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    const rows = range.e.r + 1; // 行数 (0-based 转为 1-based)
    const columns = range.e.c + 1; // 列数 (0-based 转为 1-based)
    
    // 验证是否有实际数据
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    const nonEmptyRows = jsonData.filter(row => row.some(cell => cell !== undefined && cell !== null && cell !== ''));
    
    const actualRows = nonEmptyRows.length;
    const actualColumns = Math.max(...nonEmptyRows.map(row => row.length));
    
    console.log(`📊 Excel文件信息:`);
    console.log(`  - 工作表: ${firstSheetName}`);
    console.log(`  - 原始范围: ${worksheet['!ref']}`);
    console.log(`  - 范围解析: ${rows}行 x ${columns}列`);
    console.log(`  - 实际数据: ${actualRows}行 x ${actualColumns}列`);
    
    const finalRows = Math.max(actualRows, rows);
    const finalColumns = Math.max(actualColumns, columns);
    
    console.log(`✅ Excel解析完成: ${finalRows}行 x ${finalColumns}列`);
    return { rows: finalRows, columns: finalColumns };
    
  } catch (error) {
    console.error('❌ Excel解析详细错误:', error.message);
    throw error;
  }
}

/**
 * 解析Word文件 (.docx)
 */
async function parseWordFile(filePath) {
  console.log('📄 解析Word文件...');
  
  try {
    // 尝试提取HTML格式，更容易识别表格
    const htmlResult = await mammoth.convertToHtml({ path: filePath });
    const html = htmlResult.value;
    console.log('📝 提取的HTML内容预览:', html.substring(0, 200) + '...');
    
    // 检查是否包含表格
    const tableMatches = html.match(/<table[^>]*>[\s\S]*?<\/table>/gi);
    
    if (tableMatches && tableMatches.length > 0) {
      console.log(`🎯 发现 ${tableMatches.length} 个表格`);
      
      // 分析第一个表格
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
        
        console.log(`✅ Word表格解析完成: ${rowMatches.length}行 x ${maxColumns}列`);
        return { rows: rowMatches.length, columns: maxColumns };
      }
    }
    
    // 如果没有找到表格，尝试文本分析
    const textResult = await mammoth.extractRawText({ path: filePath });
    const text = textResult.value;
    console.log('📝 提取的文本内容预览:', text.substring(0, 200) + '...');
    
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    
    if (lines.length === 0) {
      console.log('⚠️ Word文件中没有内容');
      return { rows: 0, columns: 0 };
    }
    
    // 分析文本结构
    let maxColumns = 0;
    let tableRows = 0;
    
    for (const line of lines) {
      // 寻找制表符、多个空格、或特殊分隔符
      const separators = [
        /\t/g,           // 制表符
        /\s{2,}/g,       // 两个或更多空格
        /\|/g,           // 竖线分隔符
        /,/g             // 逗号分隔符
      ];
      
      for (const separator of separators) {
        const matches = line.match(separator);
        if (matches && matches.length > 0) {
          const columnCount = matches.length + 1;
          if (columnCount > 1) {
            maxColumns = Math.max(maxColumns, columnCount);
            tableRows++;
            break; // 找到分隔符就跳出循环
          }
        }
      }
    }
    
    // 如果还是没有检测到表格结构，使用默认值
    if (maxColumns === 0) {
      // 检查是否有关键词表明这是评分表
      const rubricKeywords = ['criteria', 'score', 'points', 'excellent', 'good', 'fair', 'poor', '优秀', '良好', '一般', '较差', '评分', '标准'];
      const hasRubricKeywords = rubricKeywords.some(keyword => text.toLowerCase().includes(keyword.toLowerCase()));
      
      if (hasRubricKeywords) {
        // 如果包含评分表关键词，估算一个合理的表格大小
        maxColumns = 4; // 通常评分表有4-5列（标准、优秀、良好、一般、较差）
        tableRows = Math.min(Math.max(lines.length, 3), 10); // 至少3行，最多10行
      } else {
        maxColumns = 2;
        tableRows = Math.min(lines.length, 5);
      }
    }
    
    console.log(`✅ Word解析完成: ${tableRows}行 x ${maxColumns}列`);
    return { rows: tableRows, columns: maxColumns };
    
  } catch (error) {
    console.error('❌ Word文件解析失败:', error);
    return { rows: 0, columns: 0 };
  }
}

/**
 * 解析CSV文件
 */
async function parseCSVFile(filePath) {
  console.log('📋 解析CSV文件...');
  
  return new Promise((resolve, reject) => {
    const rows = [];
    let maxColumns = 0;
    
    fs.createReadStream(filePath)
      .pipe(csv({ headers: false })) // 不使用第一行作为headers
      .on('data', (row) => {
        const columnCount = Object.keys(row).length;
        maxColumns = Math.max(maxColumns, columnCount);
        rows.push(row);
      })
      .on('end', () => {
        console.log(`✅ CSV解析完成: ${rows.length}行 x ${maxColumns}列`);
        resolve({ rows: rows.length, columns: maxColumns });
      })
      .on('error', (error) => {
        console.error('❌ CSV解析失败:', error);
        reject(error);
      });
  });
}

module.exports = {
  parseRubricFile
};
