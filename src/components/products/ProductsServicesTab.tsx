import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import { ArrowLeft, Check, Eye, Mail, Package, X, ChevronLeft, ChevronRight, ExternalLink, LayoutGrid, List as ListIcon } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Product, ProductDocument } from '@/types/product';
import { ProductDocumentViewCard } from '@/components/products/ProductDocumentViewCard';
import { useValidatedProductImages } from '@/hooks/useValidatedProductImages';

interface ProductsServicesTabProps {
  products: Product[];
  selectedProduct: Product | null;
  setSelectedProduct: (product: Product | null) => void;
  productsLoading: boolean;
  productDocuments: ProductDocument[];
  productDocumentsLoading: boolean;
  handleProductDocumentDownload: (doc: ProductDocument) => Promise<void> | void;
  formatFileSize: (bytes: number) => string;
  companyWebsite?: string;
}

export const ProductsServicesTab: React.FC<ProductsServicesTabProps> = ({
  products,
  selectedProduct,
  setSelectedProduct,
  productsLoading,
  productDocuments,
  productDocumentsLoading,
  handleProductDocumentDownload,
  formatFileSize,
  companyWebsite,
}) => {
  const [imageModalOpen, setImageModalOpen] = React.useState(false);
  const [currentImageIndex, setCurrentImageIndex] = React.useState(0);
  const [cardsView, setCardsView] = React.useState<'grid' | 'list'>('list');
  const [listPageSize, setListPageSize] = React.useState<10 | 20 | 50>(10);
  const [listPage, setListPage] = React.useState(1);

  // Validate and compose image URLs only for selected product
  const { validImages, isValidating } = useValidatedProductImages(
    selectedProduct?.image,
    companyWebsite,
    !!selectedProduct // Only validate when a product is selected
  );

  // Log selected product images to console
  React.useEffect(() => {
    if (selectedProduct && selectedProduct.image && selectedProduct.image.length > 0) {
      console.log(`🖼️ Selected Product: "${selectedProduct.product_name}" - Original Images:`, selectedProduct.image);
    }
  }, [selectedProduct]);

  // Log validated images
  React.useEffect(() => {
    if (validImages.length > 0) {
      console.log(`✅ Validated Images for "${selectedProduct?.product_name}":`, validImages);
    }
  }, [validImages, selectedProduct?.product_name]);

  const nextImage = () => {
    if (!validImages || validImages.length === 0) return;
    setCurrentImageIndex((prev) => (prev + 1) % validImages.length);
  };

  const prevImage = () => {
    if (!validImages || validImages.length === 0) return;
    setCurrentImageIndex((prev) => (prev - 1 + validImages.length) % validImages.length);
  };

  const totalListPages = Math.max(1, Math.ceil(products.length / listPageSize));
  const paginatedListProducts = React.useMemo(() => {
    const start = (listPage - 1) * listPageSize;
    return products.slice(start, start + listPageSize);
  }, [products, listPage, listPageSize]);

  React.useEffect(() => {
    setListPage(1);
  }, [listPageSize, cardsView]);

  React.useEffect(() => {
    if (listPage > totalListPages) {
      setListPage(totalListPages);
    }
  }, [listPage, totalListPages]);

  return (
    <TabsContent value="products">
      <div className="space-y-6 pb-64">
        {selectedProduct && (
          <div className="flex items-center gap-4 mb-6">
            <Button onClick={() => setSelectedProduct(null)} variant="outline" className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Product List
            </Button>
            <div className="h-px bg-gray-200 flex-1" />
          </div>
        )}

        {!selectedProduct && (
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-navy">Products & Services</h2>
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center rounded-lg border border-gray-200 p-1 bg-white">
                <Button
                  type="button"
                  variant={cardsView === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setCardsView('grid')}
                  className="h-8 px-3 gap-2"
                >
                  <LayoutGrid className="w-4 h-4" />
                  Grid
                </Button>
                <Button
                  type="button"
                  variant={cardsView === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setCardsView('list')}
                  className="h-8 px-3 gap-2"
                >
                  <ListIcon className="w-4 h-4" />
                  List
                </Button>
              </div>
              {cardsView === 'list' && products.length > 10 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">Show</span>
                  <select
                    value={listPageSize}
                    onChange={(e) => setListPageSize(Number(e.target.value) as 10 | 20 | 50)}
                    className="h-8 rounded-md border border-gray-200 bg-white px-2 text-sm text-navy"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              )}
              {productsLoading && <span className="text-sm text-gray-500">Loading products...</span>}
            </div>
          </div>
        )}

        {selectedProduct ? (
          <div className="space-y-8">
            <div className="grid grid-cols-12 gap-8">
              <div className="col-span-12 lg:col-span-8">
                <Card className="shadow-lg border-0">
                  <CardHeader style={{background: 'linear-gradient(135deg, #22183a0D 0%, #f4a9aa26 100%)'}}>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-3xl text-navy mb-2">{selectedProduct.product_name}</CardTitle>
                        <Badge className="bg-navy text-white text-sm px-3 py-1">{selectedProduct.main_category}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-8 space-y-6">
                    {/* YouTube video on top if available */}
                    {(() => {
                      const url = (selectedProduct as any)?.youtube_url as string | undefined;
                      const getEmbed = (u?: string | null) => {
                        if (!u || typeof u !== 'string') return null;
                        try {
                          const t = u.trim();
                          const short = t.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/);
                          if (short && short[1]) return `https://www.youtube.com/embed/${short[1]}`;
                          const uo = new URL(t, window.location.origin);
                          const v = uo.searchParams.get('v');
                          if (v) return `https://www.youtube.com/embed/${v}`;
                          if (t.includes('/embed/')) return t;
                        } catch {}
                        return null;
                      };
                      const embed = getEmbed(url);
                      return embed ? (
                        <div className="mb-4">
                          <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
                            <iframe
                              className="absolute inset-0 w-full h-full rounded-lg border"
                              src={embed}
                              title="Product video"
                              frameBorder={0}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                              allowFullScreen
                            />
                          </div>
                        </div>
                      ) : null;
                    })()}
                    {selectedProduct.short_description && (
                      <p className="text-charcoal leading-relaxed">
                        {selectedProduct.short_description}
                      </p>
                    )}

                    {selectedProduct.long_description && (
                      <div>
                        <h3 className="text-xl font-semibold text-navy mb-3">Description</h3>
                        <p className="text-charcoal leading-relaxed">
                          {selectedProduct.long_description}
                        </p>
                      </div>
                    )}

                    {isValidating ? (
                      <div className="text-center py-4">
                        <p className="text-muted-foreground">Validating images...</p>
                      </div>
                    ) : validImages && validImages.length > 0 && (
                      <div>
                        <h3 className="text-xl font-semibold text-navy mb-3">Product Images</h3>
                        <div className="flex gap-4">
                          {validImages.map((imageUrl, index) => (
                            <div
                              key={index}
                              className="flex-1 cursor-pointer group relative overflow-hidden rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200"
                              onClick={() => { setCurrentImageIndex(index); setImageModalOpen(true); }}
                            >
                              <img
                                src={imageUrl}
                                alt={`${selectedProduct.product_name} - Image ${index + 1}`}
                                className="w-full h-32 object-cover group-hover:scale-105 transition-transform duration-200"
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-center justify-center">
                                <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedProduct.key_features && selectedProduct.key_features.length > 0 && (
                      <div>
                        <h3 className="text-xl font-semibold text-navy mb-3">Key Features</h3>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                          {selectedProduct.key_features.map((feature, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-2 p-3 rounded-lg"
                              style={{ backgroundColor: 'rgba(244, 169, 170, 0.15)', border: '1px solid #f4a9aa' }}
                            >
                              <Check className="w-4 h-4 flex-shrink-0" style={{ color: '#f4a9aa' }} />
                              <span className="text-sm" style={{ color: '#22183a' }}>{feature}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedProduct.subcategories && selectedProduct.subcategories.length > 0 && (
                      <div>
                        <h3 className="text-xl font-semibold text-navy mb-3">Categories</h3>
                        <div className="flex flex-wrap gap-2">
                          {selectedProduct.subcategories.map((category, index) => (
                            <Badge key={index} variant="outline" className="border-sky text-sky">
                              {category}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="col-span-12 lg:col-span-4">
                <Card className="shadow-lg border-0 lg:sticky lg:top-8">
                  <CardHeader>
                    <CardTitle className="text-navy">Product Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {selectedProduct.product_url && (
                      <div>
                        <Button
                          className="w-full font-semibold"
                          variant="outline"
                          onClick={() => window.open(selectedProduct.product_url, '_blank', 'noopener,noreferrer')}
                        >
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Visit Product Website
                        </Button>
                      </div>
                    )}
                    {selectedProduct.use_cases && selectedProduct.use_cases.length > 0 && (
                      <div>
                        <h3 className="text-xl font-semibold text-navy mb-2">Use Cases</h3>
                        <div className="space-y-2">
                          {selectedProduct.use_cases.map((useCase, index) => (
                            <div
                              key={index}
                              className="flex items-start gap-2 p-3 rounded-lg"
                              style={{ backgroundColor: 'rgba(128, 200, 240, 0.15)' }}
                            >
                              <div className="w-2 h-2 rounded-full mt-2 flex-shrink-0" style={{ backgroundColor: '#f4a9aa' }} />
                              <span className="text-sm" style={{ color: '#242424' }}>{useCase}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedProduct.target_industries && selectedProduct.target_industries.length > 0 && (
                      <div>
                        <h3 className="text-xl font-semibold text-navy mb-2">Target Industries</h3>
                        <div className="space-y-2">
                          {selectedProduct.target_industries.map((industry, index) => (
                            <Badge key={index} variant="secondary" className="text-xs">{industry}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {productDocuments.length > 0 && (
                      <div>
                        <h3 className="text-xl font-semibold text-navy mb-2">Product Documents</h3>
                        <div className="grid grid-cols-1 gap-4">
                          {productDocuments.map((doc) => (
                            <ProductDocumentViewCard
                              key={doc.id}
                              document={doc}
                              onDownload={handleProductDocumentDownload}
                              formatFileSize={formatFileSize}
                            />
                          ))}
                        </div>
                        {productDocumentsLoading && (
                          <div className="text-center py-4">
                            <p className="text-muted-foreground">Loading documents...</p>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="pt-4 border-t">
                      <Button
                        className="w-full font-semibold"
                        style={{ backgroundColor: '#f4a9aa', color: '#22183a' }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#6cd389')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#f4a9aa')}
                      >
                        <Mail className="w-4 h-4 mr-2" />
                        Request Quote
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        ) : (
          <div>
            {products.length === 0 ? (
              <Card className="rounded-xl shadow-lg border-0">
                <CardContent className="pt-6 text-center py-12">
                  <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No products available for this supplier.</p>
                </CardContent>
              </Card>
            ) : (
              cardsView === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {products.map((product) => (
                    <div
                      key={product.id}
                      style={{
                        backgroundColor: '#ffffff',
                        borderRadius: '12px',
                        border: '1px solid #f1f1f1',
                        cursor: 'pointer',
                        transition: 'box-shadow 0.2s, transform 0.2s',
                        height: 'fit-content',
                        display: 'flex',
                        flexDirection: 'column',
                        width: '100%',
                        overflow: 'hidden',
                      }}
                      onClick={() => setSelectedProduct(product)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.1)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = 'none';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      <div
                        style={{
                          background: 'linear-gradient(135deg, #22183a 0%, #f4a9aa 100%)',
                          padding: '20px',
                          color: 'white',
                        }}
                      >
                        <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>
                          {product.product_name}
                        </h3>
                        <div
                          style={{
                            fontSize: '12px',
                            backgroundColor: 'rgba(255,255,255,0.25)',
                            color: '#ffffff',
                            padding: '4px 12px',
                            borderRadius: '12px',
                            display: 'inline-block',
                          }}
                        >
                          {product.main_category}
                        </div>
                      </div>

                      <div style={{ padding: '20px' }}>
                        <p
                          style={{ color: '#242424', fontSize: '14px', marginBottom: '16px', lineHeight: '1.5' }}
                        >
                          {product.short_description}
                        </p>

                        {product.key_features && product.key_features.length > 0 && (
                          <div style={{ marginBottom: '16px' }}>
                            <h5
                              style={{
                                fontWeight: '600',
                                color: '#22183a',
                                fontSize: '14px',
                                marginBottom: '8px',
                              }}
                            >
                              Key Features
                            </h5>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {product.key_features.slice(0, 3).map((feature, index) => (
                                <div
                                  key={index}
                                  style={{
                                    fontSize: '12px',
                                    backgroundColor: 'rgba(244, 169, 170, 0.15)',
                                    color: '#22183a',
                                    padding: '4px 8px',
                                    borderRadius: '8px',
                                    border: '1px solid #f4a9aa',
                                  }}
                                >
                                  {feature}
                                </div>
                              ))}
                              {product.key_features.length > 3 && (
                                <div
                                  style={{
                                    fontSize: '12px',
                                    backgroundColor: '#f1f1f1',
                                    color: '#242424',
                                    padding: '4px 8px',
                                    borderRadius: '8px',
                                  }}
                                >
                                  +{product.key_features.length - 3} more
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {product.target_industries && product.target_industries.length > 0 && (
                          <div style={{ marginBottom: '16px' }}>
                            <h5
                              style={{
                                fontWeight: '600',
                                color: '#22183a',
                                fontSize: '14px',
                                marginBottom: '8px',
                              }}
                            >
                              Target Industries
                            </h5>
                            <p style={{ fontSize: '12px', color: '#242424', lineHeight: '1.4' }}>
                              {product.target_industries.slice(0, 2).join(', ')}
                              {product.target_industries.length > 2 && ` +${product.target_industries.length - 2} more`}
                            </p>
                          </div>
                        )}

                        <div
                          style={{
                            paddingTop: '16px',
                            borderTop: '1px solid #f0f0f0',
                            marginTop: 'auto',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              fontSize: '12px',
                              color: '#f4a9aa',
                              fontWeight: '500',
                            }}
                          >
                            <Eye style={{ width: '14px', height: '14px', marginRight: '6px' }} />
                            Click to view details
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {paginatedListProducts.map((product) => (
                    <div
                      key={product.id}
                      onClick={() => setSelectedProduct(product)}
                      className="cursor-pointer rounded-xl border border-[#f1f1f1] bg-white overflow-hidden transition-all duration-200 hover:shadow-[0_8px_25px_rgba(0,0,0,0.1)] hover:-translate-y-[1px]"
                    >
                      <div className="flex flex-col md:flex-row md:min-h-[220px]">
                        <div
                          className="md:w-[280px] w-full p-5 md:p-6 text-white flex flex-col justify-between"
                          style={{ background: 'linear-gradient(135deg, #22183a 0%, #f4a9aa 100%)' }}
                        >
                          <div>
                            <h3 className="text-xl font-semibold mb-2">{product.product_name}</h3>
                            <div className="inline-block text-xs bg-white/25 text-white px-3 py-1 rounded-full">
                              {product.main_category}
                            </div>
                          </div>
                          <div className="mt-6 hidden md:flex items-center text-sm text-white/95">
                            <Eye className="w-4 h-4 mr-2" />
                            Click to view details
                          </div>
                        </div>

                        <div className="flex-1 p-5 md:p-6">
                          <p className="text-[#242424] text-sm leading-6 mb-4">
                            {product.short_description}
                          </p>

                          {product.key_features && product.key_features.length > 0 && (
                            <div className="mb-4">
                              <h5 className="font-semibold text-[#22183a] text-sm mb-2">Key Features</h5>
                              <div className="flex flex-wrap gap-2">
                                {product.key_features.slice(0, 4).map((feature, index) => (
                                  <div
                                    key={index}
                                    className="text-xs px-2 py-1 rounded-md border"
                                    style={{
                                      backgroundColor: 'rgba(244, 169, 170, 0.15)',
                                      color: '#22183a',
                                      borderColor: '#f4a9aa',
                                    }}
                                  >
                                    {feature}
                                  </div>
                                ))}
                                {product.key_features.length > 4 && (
                                  <div className="text-xs px-2 py-1 rounded-md bg-[#f1f1f1] text-[#242424]">
                                    +{product.key_features.length - 4} more
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {product.target_industries && product.target_industries.length > 0 && (
                            <div>
                              <h5 className="font-semibold text-[#22183a] text-sm mb-2">Target Industries</h5>
                              <p className="text-xs text-[#242424] leading-5">
                                {product.target_industries.slice(0, 3).join(', ')}
                                {product.target_industries.length > 3 && ` +${product.target_industries.length - 3} more`}
                              </p>
                            </div>
                          )}

                          <div className="md:hidden mt-4 pt-3 border-t border-[#f0f0f0] flex items-center text-xs font-medium text-[#f4a9aa]">
                            <Eye className="w-3.5 h-3.5 mr-2" />
                            Click to view details
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {products.length > listPageSize && (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
                      <div className="text-sm text-gray-600">
                        Showing {(listPage - 1) * listPageSize + 1}-
                        {Math.min(listPage * listPageSize, products.length)} of {products.length}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setListPage((prev) => Math.max(1, prev - 1))}
                          disabled={listPage === 1}
                        >
                          Previous
                        </Button>
                        <span className="text-sm text-gray-600 min-w-[88px] text-center">
                          Page {listPage} / {totalListPages}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setListPage((prev) => Math.min(totalListPages, prev + 1))}
                          disabled={listPage === totalListPages}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        )}
        {imageModalOpen && validImages && validImages.length > 0 && (
          <Dialog open={imageModalOpen} onOpenChange={setImageModalOpen}>
            <DialogContent className="max-w-4xl max-h-[90vh] p-0">
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-4 right-4 z-50 bg-black/50 text-white hover:bg-black/70"
                  onClick={() => setImageModalOpen(false)}
                >
                  <X className="w-4 h-4" />
                </Button>

                {validImages.length > 1 && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute left-4 top-1/2 transform -translate-y-1/2 z-50 bg-black/50 text-white hover:bg-black/70"
                      onClick={prevImage}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 z-50 bg-black/50 text-white hover:bg-black/70"
                      onClick={nextImage}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50 bg-black/50 text-white px-3 py-1 rounded text-sm">
                      {currentImageIndex + 1} / {validImages.length}
                    </div>
                  </>
                )}

                <img
                  src={validImages[currentImageIndex]}
                  alt={`${selectedProduct?.product_name} - Image ${currentImageIndex + 1}`}
                  className="w-full h-auto max-h-[90vh] object-contain"
                />
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </TabsContent>
  );
};

export default ProductsServicesTab;


