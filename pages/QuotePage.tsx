import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../firebase';
import { collection, query, where, doc, getDocs } from 'firebase/firestore';
import { useFirestoreCollection } from '../hooks/useFirestoreCollection';
import { Country, City, Category, Product, Quote, QuoteDay, QuoteItem, QuoteInfo } from '../types';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import { generateTextQuote, exportCsvQuote } from '../services/exportService';

const formatCurrency = (amount: number): string => {
    return `₩${Math.round(amount).toLocaleString('ko-KR')}`;
}

const QuotePage: React.FC = () => {
    const { data: countries } = useFirestoreCollection<Country>('Countries');
    const { data: allCities } = useFirestoreCollection<City>('Cities');
    
    const [quoteInfo, setQuoteInfo] = useState<QuoteInfo>({
        customerName: '',
        countryId: '',
        cityId: '',
        pax: { adults: 1, children: 0, infants: 0 },
    });
    
    const [days, setDays] = useState<QuoteDay[]>([{ id: crypto.randomUUID(), items: [], dayTotal: 0 }]);
    const [grandTotal, setGrandTotal] = useState(0);

    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [activeDayId, setActiveDayId] = useState<string | null>(null);
    
    const [modalProducts, setModalProducts] = useState<Record<string, Product[]>>({});
    const [isModalLoading, setIsModalLoading] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);

    const availableCities = useMemo(() => {
        if (!quoteInfo.countryId) return [];
        return allCities.filter(city => city.CountryRef.id === quoteInfo.countryId);
    }, [quoteInfo.countryId, allCities]);

    const recalculateQuote = useCallback((currentDays: QuoteDay[]): { newDays: QuoteDay[], newGrandTotal: number } => {
        let grandTotal = 0;
        const newDays = currentDays.map(day => {
            let dayTotal = 0;
            const newItems = day.items.map(item => {
                const total = item.quantity * item.appliedPrice;
                dayTotal += total;
                return { ...item, total };
            });
            grandTotal += dayTotal;
            return { ...day, items: newItems, dayTotal };
        });
        return { newDays, newGrandTotal: grandTotal };
    }, []);

    const handleInfoChange = (field: keyof QuoteInfo, value: any) => {
        if (field === 'pax') {
            const newPax = { ...quoteInfo.pax, ...value };
            setQuoteInfo(prev => ({ ...prev, pax: newPax }));
        } else {
            setQuoteInfo(prev => ({ ...prev, [field]: value }));
        }
    };
    
    useEffect(() => {
        if (quoteInfo.countryId && !availableCities.find(c => c.id === quoteInfo.cityId)) {
            setQuoteInfo(prev => ({ ...prev, cityId: '' }));
        }
    }, [quoteInfo.countryId, quoteInfo.cityId, availableCities]);


    const addDay = () => setDays([...days, { id: crypto.randomUUID(), items: [], dayTotal: 0 }]);
    
    const removeDay = (id: string) => {
        setDays(currentDays => {
            const intermediateDays = currentDays.filter(d => d.id !== id);
            const { newDays, newGrandTotal } = recalculateQuote(intermediateDays);
            setGrandTotal(newGrandTotal);
            return newDays;
        });
    };

    const openProductSelector = async (dayId: string) => {
        if (!quoteInfo.cityId) return;

        setActiveDayId(dayId);
        setIsProductModalOpen(true);
        setIsModalLoading(true);
        setModalError(null);
        setModalProducts({});

        try {
            const cityRef = doc(db, 'Cities', quoteInfo.cityId);
            const productsQuery = query(collection(db, 'Products'), where('CityRef', '==', cityRef));
            const productsPromise = getDocs(productsQuery);
            const categoriesPromise = getDocs(collection(db, 'Categories'));

            const [productSnapshot, categorySnapshot] = await Promise.all([productsPromise, categoriesPromise]);

            const categoryMap = new Map<string, string>();
            categorySnapshot.forEach(doc => {
                categoryMap.set(doc.id, doc.data().CategoryName);
            });

            const enrichedProducts: Product[] = productSnapshot.docs.map(doc => {
                const productData = doc.data() as Omit<Product, 'id'>;
                const categoryId = (productData.CategoryRef as any)?.id;
                return {
                    id: doc.id,
                    ...productData,
                    CategoryName: categoryMap.get(categoryId) || '미분류'
                };
            });
            
            const grouped = enrichedProducts.reduce((acc, product) => {
                const categoryName = product.CategoryName || '미분류';
                if (!acc[categoryName]) {
                    acc[categoryName] = [];
                }
                acc[categoryName].push(product);
                return acc;
            }, {} as Record<string, Product[]>);

            setModalProducts(grouped);

        } catch (err) {
            console.error("Failed to fetch products or categories:", err);
            setModalError("상품 정보를 불러오는 데 실패했습니다.");
        } finally {
            setIsModalLoading(false);
        }
    };
    
    const addProductToDay = (product: Product) => {
        let initialQuantity = 1;
        let initialAppliedPrice = 0;
    
        if (product.PricingType === 'PerPerson') {
            const totalPax = quoteInfo.pax.adults + quoteInfo.pax.children + quoteInfo.pax.infants;
            initialQuantity = totalPax > 0 ? totalPax : 1;
            const totalPrice =
                (quoteInfo.pax.adults * (product.Price_Adult || 0)) +
                (quoteInfo.pax.children * (product.Price_Child || 0)) +
                (quoteInfo.pax.infants * (product.Price_Infant || 0));
            initialAppliedPrice = totalPax > 0 ? Math.round(totalPrice / totalPax) : 0;
        } else { // PerUnit
            initialQuantity = 1;
            initialAppliedPrice = product.Price_Unit || 0;
        }

        const newQuoteItem: QuoteItem = {
            id: crypto.randomUUID(),
            product: product,
            quantity: initialQuantity,
            appliedPrice: initialAppliedPrice,
            total: 0, // Will be recalculated
        };
        
        setDays(currentDays => {
            const intermediateDays = currentDays.map(d => {
                if (d.id === activeDayId) {
                    return { ...d, items: [...d.items, newQuoteItem] };
                }
                return d;
            });
            const { newDays, newGrandTotal } = recalculateQuote(intermediateDays);
            setGrandTotal(newGrandTotal);
            return newDays;
        });
        
        setIsProductModalOpen(false);
        setActiveDayId(null);
    };
    
    const updateQuoteItem = (dayId: string, itemId: string, field: 'quantity' | 'appliedPrice', value: number) => {
        setDays(currentDays => {
            const intermediateDays = currentDays.map(day => {
                if (day.id === dayId) {
                    const updatedItems = day.items.map(item => {
                        if (item.id === itemId) {
                            return { ...item, [field]: value };
                        }
                        return item;
                    });
                    return { ...day, items: updatedItems };
                }
                return day;
            });
            const { newDays, newGrandTotal } = recalculateQuote(intermediateDays);
            setGrandTotal(newGrandTotal);
            return newDays;
        });
    };

    const removeQuoteItem = (dayId: string, itemId: string) => {
        setDays(currentDays => {
            const intermediateDays = currentDays.map(day => {
                if (day.id === dayId) {
                    return { ...day, items: day.items.filter(item => item.id !== itemId) };
                }
                return day;
            });
            const { newDays, newGrandTotal } = recalculateQuote(intermediateDays);
            setGrandTotal(newGrandTotal);
            return newDays;
        });
    }

    const fullQuote: Quote = { info: quoteInfo, days, grandTotal };

    const handleCopyToClipboard = () => {
        navigator.clipboard.writeText(generateTextQuote(fullQuote))
            .then(() => {
                alert('견적 내용이 클립보드에 복사되었습니다.');
            })
            .catch(err => {
                console.error('클립보드 복사 실패:', err);
                alert('클립보드 복사에 실패했습니다.');
            });
    };

    const handleExportCsv = () => {
        exportCsvQuote(fullQuote);
        alert('견적서가 CSV 파일로 다운로드됩니다.');
    };

    return (
      <div className="space-y-8">
        <div className="p-6 bg-white rounded-lg shadow-md">
            <h2 className="text-xl font-bold mb-4">1. 기본 정보</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Input label="고객명" id="customer-name" value={quoteInfo.customerName} onChange={e => handleInfoChange('customerName', e.target.value)} />
                <Select label="국가" id="country" value={quoteInfo.countryId} onChange={e => handleInfoChange('countryId', e.target.value)}>
                    <option value="">국가 선택</option>
                    {countries.map(c => <option key={c.id} value={c.id}>{c.CountryName}</option>)}
                </Select>
                <Select label="도시" id="city" value={quoteInfo.cityId} onChange={e => handleInfoChange('cityId', e.target.value)} disabled={!quoteInfo.countryId}>
                    <option value="">도시 선택</option>
                    {availableCities.map(c => <option key={c.id} value={c.id}>{c.CityName}</option>)}
                </Select>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4">
                <Input label="성인" id="pax-adults" type="number" min="0" value={quoteInfo.pax.adults} onChange={e => handleInfoChange('pax', { adults: parseInt(e.target.value) || 0 })} />
                <Input label="아동" id="pax-children" type="number" min="0" value={quoteInfo.pax.children} onChange={e => handleInfoChange('pax', { children: parseInt(e.target.value) || 0 })} />
                <Input label="유아" id="pax-infants" type="number" min="0" value={quoteInfo.pax.infants} onChange={e => handleInfoChange('pax', { infants: parseInt(e.target.value) || 0 })} />
            </div>
        </div>

        <div className="p-6 bg-white rounded-lg shadow-md">
            <h2 className="text-xl font-bold mb-4">2. 일정</h2>
            <div className="space-y-6">
                {days.map((day, index) => {
                    const itemsByCategory = day.items.reduce((acc, item) => {
                        const categoryName = item.product.CategoryName || '미분류';
                        if (!acc[categoryName]) {
                            acc[categoryName] = [];
                        }
                        acc[categoryName].push(item);
                        return acc;
                    }, {} as Record<string, QuoteItem[]>);

                    const sortedCategories = Object.keys(itemsByCategory).sort((a, b) => {
                        if (a === '미분류') return 1;
                        if (b === '미분류') return -1;
                        return a.localeCompare(b);
                    });

                    return (
                        <div key={day.id} className="border border-gray-200 p-4 rounded-md">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="font-bold text-lg">{index + 1}일차</h3>
                                <Button size="sm" variant="danger" onClick={() => removeDay(day.id)} disabled={days.length <= 1}>일차 삭제</Button>
                            </div>
                            
                            <div className="space-y-4">
                                {day.items.length === 0 ? (
                                    <p className="text-sm text-gray-500 text-center py-4 bg-gray-50 rounded-md">추가된 상품이 없습니다.</p>
                                ) : (
                                    sortedCategories.map(categoryName => (
                                        <div key={categoryName}>
                                            <h4 className="font-semibold text-md text-blue-800 bg-blue-50 px-3 py-1.5 rounded-t-md">{categoryName}</h4>
                                            <div className="space-y-2 border border-t-0 border-gray-200 p-2 rounded-b-md">
                                                {itemsByCategory[categoryName].map(item => (
                                                   <div key={item.id} className="grid grid-cols-12 gap-2 items-center p-2 even:bg-white odd:bg-gray-50 rounded">
                                                       <div className="col-span-12 md:col-span-4 font-medium">
                                                            {item.product.ProductURL ? (
                                                                <a href={item.product.ProductURL} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                                                    {item.product.ProductName}
                                                                </a>
                                                            ) : (
                                                                item.product.ProductName
                                                            )}
                                                       </div>
                                                       <div className="col-span-4 md:col-span-2 text-sm text-gray-600">{item.product.PricingType === 'PerPerson' ? '인당' : '단위당'}</div>
                                                       <>
                                                           <div className="col-span-4 md:col-span-2">
                                                             <Input label="수량" type="number" min="1" value={item.quantity} onChange={(e) => updateQuoteItem(day.id, item.id, 'quantity', parseInt(e.target.value) || 1)} className="py-1" />
                                                           </div>
                                                           <div className="col-span-4 md:col-span-2">
                                                             <Input label="적용가" type="number" min="0" value={item.appliedPrice} onChange={(e) => updateQuoteItem(day.id, item.id, 'appliedPrice', parseFloat(e.target.value) || 0)} className="py-1" />
                                                           </div>
                                                        </>
                                                       <div className="col-span-10 md:col-span-3 font-semibold text-right">{formatCurrency(item.total)}</div>
                                                       <div className="col-span-2 md:col-span-1 text-right">
                                                         <button onClick={() => removeQuoteItem(day.id, item.id)} className="text-red-500 hover:text-red-700">
                                                             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                                                         </button>
                                                       </div>
                                                   </div>
                                               ))}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                            
                            <div className="text-right font-bold mt-3">일차 합계: {formatCurrency(day.dayTotal)}</div>
                            <div className="relative inline-block mt-4 group">
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => openProductSelector(day.id)}
                                    disabled={!quoteInfo.cityId}
                                >
                                   + 상품 추가
                                </Button>
                                {!quoteInfo.cityId && (
                                    <div
                                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max whitespace-nowrap px-3 py-1.5 bg-gray-800 text-white text-xs font-semibold rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-20"
                                        role="tooltip"
                                    >
                                        여행지역을 선택해 주세요
                                        <svg className="absolute text-gray-800 h-2 w-full left-0 top-full" x="0px" y="0px" viewBox="0 0 255 255" xmlSpace="preserve">
                                            <polygon className="fill-current" points="0,0 127.5,127.5 255,0"/>
                                        </svg>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            <Button onClick={addDay} className="mt-6">+ 일차 추가</Button>
        </div>

        <div className="sticky bottom-0 z-10">
            <div className="p-4 bg-white rounded-t-lg shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                <div className="flex justify-between items-center">
                    <div>
                        <span className="text-xl font-bold">총 합계: </span>
                        <span className="text-2xl font-bold text-blue-600">{formatCurrency(grandTotal)}</span>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={handleCopyToClipboard}>텍스트 복사</Button>
                        <Button onClick={handleExportCsv} variant="secondary">CSV로 내보내기</Button>
                    </div>
                </div>
            </div>
        </div>

        {isProductModalOpen && (
            <ProductSelectorModal
                isOpen={isProductModalOpen}
                onClose={() => {
                    setIsProductModalOpen(false);
                    setActiveDayId(null);
                }}
                onAddProduct={addProductToDay}
                productsByCategory={modalProducts}
                isLoading={isModalLoading}
                error={modalError}
            />
        )}
      </div>
    );
};

interface ProductSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAddProduct: (product: Product) => void;
    productsByCategory: Record<string, Product[]>;
    isLoading: boolean;
    error: string | null;
}

const ProductSelectorModal: React.FC<ProductSelectorModalProps> = ({ isOpen, onClose, onAddProduct, productsByCategory, isLoading, error }) => {
    
    const [searchTerm, setSearchTerm] = useState('');

    const filteredProductsByCategory = useMemo(() => {
        if (!searchTerm.trim()) {
            return productsByCategory;
        }
        const lowercasedFilter = searchTerm.toLowerCase().trim();
        const filtered: Record<string, Product[]> = {};

        for (const categoryName in productsByCategory) {
            const products = productsByCategory[categoryName];
            const filteredProducts = products.filter(product =>
                product.ProductName.toLowerCase().includes(lowercasedFilter)
            );

            if (filteredProducts.length > 0) {
                filtered[categoryName] = filteredProducts;
            }
        }
        return filtered;
    }, [productsByCategory, searchTerm]);

    const sortedCategories = useMemo(() => {
        return Object.keys(filteredProductsByCategory)
            .filter(name => name !== '미분류')
            .sort((a, b) => a.localeCompare(b));
    }, [filteredProductsByCategory]);

    const uncategorizedProducts = filteredProductsByCategory['미분류'] || [];
    
    const hasOriginalProducts = Object.keys(productsByCategory).length > 0;
    const hasFilteredProducts = Object.keys(filteredProductsByCategory).length > 0;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="상품 선택">
            {isLoading ? (
                <p className="text-center text-gray-500">상품 로딩 중...</p>
            ) : error ? (
                <p className="text-center text-red-500">{error}</p>
            ) : !hasOriginalProducts ? (
                <p className="text-center text-gray-500">선택하신 도시에 등록된 상품이 없습니다.</p>
            ) : (
                <div className="space-y-4">
                    <Input
                        id="product-search"
                        placeholder="상품명으로 검색..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        autoFocus
                    />

                    {hasFilteredProducts ? (
                        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                            {sortedCategories.map(categoryName => (
                                <div key={categoryName}>
                                    <h4 className="font-bold text-lg text-gray-700 mb-2 sticky top-0 bg-white py-1">{categoryName}</h4>
                                    <ul className="space-y-2">
                                        {filteredProductsByCategory[categoryName].map(product => (
                                            <li key={product.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-md hover:bg-blue-50 transition-colors">
                                                <div>
                                                    {product.ProductURL ? (
                                                        <a href={product.ProductURL} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline">
                                                            {product.ProductName}
                                                        </a>
                                                    ) : (
                                                        <p className="font-medium">{product.ProductName}</p>
                                                    )}
                                                    {product.ProductDescription && (
                                                      <p className="text-xs text-gray-600 mt-1">{product.ProductDescription}</p>
                                                    )}
                                                    <p className="text-sm text-gray-500 mt-1">
                                                        {product.PricingType === 'PerPerson'
                                                            ? `성인: ${formatCurrency(product.Price_Adult || 0)} / 아동: ${formatCurrency(product.Price_Child || 0)} / 유아: ${formatCurrency(product.Price_Infant || 0)}`
                                                            : `단위당 가격: ${formatCurrency(product.Price_Unit || 0)}`
                                                        }
                                                    </p>
                                                </div>
                                                <Button size="sm" onClick={() => onAddProduct(product)}>추가</Button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                            {uncategorizedProducts.length > 0 && (
                                <div>
                                    <h4 className="font-bold text-lg text-gray-700 mb-2 sticky top-0 bg-white py-1">미분류</h4>
                                    <ul className="space-y-2">
                                        {uncategorizedProducts.map(product => (
                                            <li key={product.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-md hover:bg-blue-50 transition-colors">
                                                <div>
                                                    {product.ProductURL ? (
                                                        <a href={product.ProductURL} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline">
                                                            {product.ProductName}
                                                        </a>
                                                    ) : (
                                                        <p className="font-medium">{product.ProductName}</p>
                                                    )}
                                                     {product.ProductDescription && (
                                                      <p className="text-xs text-gray-600 mt-1">{product.ProductDescription}</p>
                                                    )}
                                                    <p className="text-sm text-gray-500 mt-1">
                                                        {product.PricingType === 'PerPerson'
                                                            ? `성인: ${formatCurrency(product.Price_Adult || 0)} / 아동: ${formatCurrency(product.Price_Child || 0)} / 유아: ${formatCurrency(product.Price_Infant || 0)}`
                                                            : `단위당 가격: ${formatCurrency(product.Price_Unit || 0)}`
                                                        }
                                                    </p>
                                                </div>
                                                <Button size="sm" onClick={() => onAddProduct(product)}>추가</Button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    ) : (
                         <p className="text-center text-gray-500 pt-4">검색 결과가 없습니다.</p>
                    )}
                </div>
            )}
        </Modal>
    );
};

export default QuotePage;