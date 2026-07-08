const fs = require('fs');

// HTML replacement
const htmlFile = 'C:/Users/Administrator/Desktop/OneSpace/OneSpace/src/app/features/dashboard/dashboard.component.html';
const newHtml = fs.readFileSync('C:/Users/Administrator/Desktop/OneSpace/OneSpace/new_widget.html', 'utf8');
let htmlContent = fs.readFileSync(htmlFile, 'utf8');

const startTag = '<!-- 3. Finance Tracker (Full Width) -->';
const endTag = '<!-- 1. Features Log (Full Width) -->';

const startIdx = htmlContent.indexOf(startTag);
const endIdx = htmlContent.indexOf(endTag);

if (startIdx !== -1 && endIdx !== -1) {
  const before = htmlContent.substring(0, startIdx);
  const after = htmlContent.substring(endIdx);
  fs.writeFileSync(htmlFile, before + newHtml + '\n      ' + after, 'utf8');
  console.log('HTML updated');
} else {
  console.log('Could not find HTML boundaries');
}

// CSS appended
const cssFile = 'C:/Users/Administrator/Desktop/OneSpace/OneSpace/src/app/features/dashboard/dashboard.component.css';
const newCss = fs.readFileSync('C:/Users/Administrator/Desktop/OneSpace/OneSpace/new_styles.css', 'utf8');
fs.appendFileSync(cssFile, '\n' + newCss, 'utf8');
console.log('CSS updated');
