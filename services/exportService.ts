import { Quote, QuoteDay, QuoteItem } from '../types';

export const generateTextQuote = (quote: Quote): string => {
  let text = `견적서: ${quote.info.customerName || '해당 없음'}\n`;
  text += `인원: 성인 ${quote.info.pax.adults}, 아동 ${quote.info.pax.children}, 유아 ${quote.info.pax.infants}\n`;
  text += '--------------------------------------------------\n\n';

  quote.days.forEach((day, index) => {
    text += `** ${index + 1}일차 **\n`;
    day.items.forEach((item) => {
      text += `- ${item.product.ProductName}`;
      if (item.product.PricingType === 'PerUnit') {
        text += ` (수량 ${item.quantity} x 단가 $${item.appliedPrice.toFixed(2)})`;
      }
      text += `: $${item.total.toFixed(2)}\n`;
    });
    text += `${index + 1}일차 합계: $${day.dayTotal.toFixed(2)}\n\n`;
  });

  text += '--------------------------------------------------\n';
  text += `총 합계: $${quote.grandTotal.toFixed(2)}\n`;

  return text;
};

export const exportCsvQuote = (quote: Quote): void => {
  const headers = [
    '일차',
    '카테고리',
    '상품명',
    '가격 유형',
    '성인',
    '아동',
    '유아',
    '단위 수량',
    '단가',
    '총 가격',
  ];

  const rows: (string | number)[][] = [];
  quote.days.forEach((day, index) => {
    day.items.forEach((item) => {
      rows.push([
        index + 1,
        item.product.CategoryName || '해당 없음',
        item.product.ProductName,
        item.product.PricingType === 'PerPerson' ? '인당' : '단위당',
        quote.info.pax.adults,
        quote.info.pax.children,
        quote.info.pax.infants,
        item.product.PricingType === 'PerUnit' ? item.quantity : '해당 없음',
        item.product.PricingType === 'PerUnit' ? item.appliedPrice.toFixed(2) : '해당 없음',
        item.total.toFixed(2),
      ]);
    });
  });

  let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // Add BOM for Excel compatibility
  csvContent += headers.join(",") + "\n";
  rows.forEach(rowArray => {
      let row = rowArray.map(item => typeof item === 'string' ? `"${item.replace(/"/g, '""')}"` : item).join(",");
      csvContent += row + "\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  const customerName = quote.info.customerName.replace(/\s+/g, '_') || '견적';
  link.setAttribute("download", `${customerName}_견적서.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};