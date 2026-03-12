import React, { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { Building2, MapPin, Globe, Save, Image, Loader2, Upload, X, Plus, Trash2, DollarSign, Navigation, FileText, Target, Trophy, Factory, Award, Users, Mail, Phone, ArrowLeft, Eye, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useCompanyAdminStatus } from '@/hooks/useCompanyAdminStatus';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CompanyCommentModal } from './CompanyCommentModal';
import { CompanyRevisionPreviewModal } from '@/components/company/CompanyRevisionPreviewModal';
import CompanyAutoFillModal from '@/components/company/CompanyAutoFillModal';

interface RevenueEntry {
  year: string;
  amount: string;
  currency: string;
}

interface LocationEntry {
  country: string;
  city: string;
  gps_coordinates: string;
}

interface CompanyFormData {
  nombre_empresa: string;
  description: string;
  main_activities: string;
  strengths: string;
  sectors: string;
  website: string;
  logo: string;
  youtube_url: string;
}

interface CompanyRevision {
  id: string;
  company_id: string;
  nombre_empresa: string;
  description?: string;
  main_activities?: string;
  strengths?: string;
  sectors?: string;
  website?: string;
  youtube_url?: string;
  countries?: any;
  cities?: any;
  gps_coordinates?: any;
  logo?: string;
  revenues?: any;
  certifications?: any;
  main_customers?: any;
  contact_emails?: any;
  contact_phones?: any;
  is_active: boolean;
}

const CompanyEditForm = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isApprovedAdmin, companyId: defaultCompanyId, companySlug } = useCompanyAdminStatus();
  
  // Get companyId from URL params, fallback to default from hook
  const companyId = searchParams.get('companyId') || defaultCompanyId;
  const [currentCompanySlug, setCurrentCompanySlug] = useState<string | null>(companySlug);
  
  const [companyData, setCompanyData] = useState<CompanyRevision | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadedLogo, setUploadedLogo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [revenues, setRevenues] = useState<RevenueEntry[]>([]);
  const [globalCurrency, setGlobalCurrency] = useState<string>('$');
  const [locations, setLocations] = useState<LocationEntry[]>([]);
  const [isGeocodingLoading, setIsGeocodingLoading] = useState(false);
  const [certifications, setCertifications] = useState<string[]>([]);
  const [mainCustomers, setMainCustomers] = useState<string[]>([]);
  const [contactEmails, setContactEmails] = useState<string[]>([]);
  const [contactPhones, setContactPhones] = useState<string[]>([]);
  const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewRevision, setPreviewRevision] = useState<any | null>(null);
  const [isCompanyAutoFillOpen, setIsCompanyAutoFillOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty }
  } = useForm<CompanyFormData>();

  const logoUrl = watch('logo');

  // Parse existing location data from different formats
  const parseExistingLocationData = (data: CompanyRevision): LocationEntry[] => {
    const countries = data.countries || [];
    const cities = data.cities || [];
    const coordinates = data.gps_coordinates || [];

    // Handle different data formats
    let countriesArray: string[] = [];
    let citiesArray: string[] = [];
    let coordinatesArray: string[] = [];

    // Parse countries
    if (Array.isArray(countries)) {
      countriesArray = countries;
    } else if (typeof countries === 'string') {
      countriesArray = countries.split(',').map(c => c.trim()).filter(c => c);
    }

    // Parse cities
    if (Array.isArray(cities)) {
      citiesArray = cities;
    } else if (typeof cities === 'string') {
      citiesArray = cities.split(',').map(c => c.trim()).filter(c => c);
    }

    // Parse GPS coordinates
    if (Array.isArray(coordinates)) {
      coordinatesArray = coordinates.map(coord => {
        if (typeof coord === 'string') return coord;
        if (typeof coord === 'object' && coord.lat && coord.lng) {
          return `${coord.lat},${coord.lng}`;
        }
        return '';
      });
    } else if (typeof coordinates === 'string') {
      coordinatesArray = coordinates.split(';').map(c => c.trim()).filter(c => c);
    }

    // Create location entries, ensuring equal length arrays
    const maxLength = Math.max(countriesArray.length, citiesArray.length, coordinatesArray.length);
    const locationEntries: LocationEntry[] = [];

    for (let i = 0; i < maxLength; i++) {
      locationEntries.push({
        country: countriesArray[i] || '',
        city: citiesArray[i] || '',
        gps_coordinates: coordinatesArray[i] || ''
      });
    }

    // Ensure at least one entry for headquarters
    if (locationEntries.length === 0) {
      locationEntries.push({ country: '', city: '', gps_coordinates: '' });
    }

    return locationEntries;
  };

  function hasRevenueChanges(): boolean {
    if (!companyData?.revenues) return revenues.length > 0;
    const originalRevenues = Array.isArray(companyData.revenues) ? companyData.revenues : [];
    return JSON.stringify(revenues) !== JSON.stringify(originalRevenues);
  }

  function hasLocationChanges(): boolean {
    if (!companyData) return locations.length > 0;
    const originalLocations = parseExistingLocationData(companyData);
    return JSON.stringify(locations) !== JSON.stringify(originalLocations);
  }

  // Format location data for saving (as arrays of strings)
  const formatLocationDataForSave = () => {
    const countries = locations.map(loc => loc.country).filter(c => c);
    const cities = locations.map(loc => loc.city).filter(c => c);
    const coordinates = locations.map(loc => loc.gps_coordinates).filter(c => c);

    return { countries, cities, gps_coordinates: coordinates };
  };

  // Add new location
  const addLocation = () => {
    setLocations([...locations, { country: '', city: '', gps_coordinates: '' }]);
  };

  // Remove location (except first one)
  const removeLocation = (index: number) => {
    if (index === 0) return; // Can't remove headquarters
    const newLocations = locations.filter((_, i) => i !== index);
    setLocations(newLocations);
  };

  // Add new certification
  const addCertification = () => {
    setCertifications([...certifications, '']);
  };

  // Remove certification
  const removeCertification = (index: number) => {
    const newCertifications = certifications.filter((_, i) => i !== index);
    setCertifications(newCertifications);
  };

  // Update certification
  const updateCertification = (index: number, value: string) => {
    const newCertifications = [...certifications];
    newCertifications[index] = value;
    setCertifications(newCertifications);
  };

  // Add new main customer
  const addMainCustomer = () => {
    if (mainCustomers.length >= 10) {
      toast({
        title: "Limit reached",
        description: "You can add up to 10 main customers only",
        variant: "destructive"
      });
      return;
    }
    setMainCustomers([...mainCustomers, '']);
  };

  // Remove main customer
  const removeMainCustomer = (index: number) => {
    const newMainCustomers = mainCustomers.filter((_, i) => i !== index);
    setMainCustomers(newMainCustomers);
  };

  // Update main customer
  const updateMainCustomer = (index: number, value: string) => {
    const newMainCustomers = [...mainCustomers];
    newMainCustomers[index] = value;
    setMainCustomers(newMainCustomers);
  };

  // Add new contact email
  const addContactEmail = () => {
    setContactEmails([...contactEmails, '']);
  };

  // Remove contact email
  const removeContactEmail = (index: number) => {
    const newContactEmails = contactEmails.filter((_, i) => i !== index);
    setContactEmails(newContactEmails);
  };

  // Update contact email
  const updateContactEmail = (index: number, value: string) => {
    const newContactEmails = [...contactEmails];
    newContactEmails[index] = value;
    setContactEmails(newContactEmails);
  };

  // Add new contact phone
  const addContactPhone = () => {
    setContactPhones([...contactPhones, '']);
  };

  // Remove contact phone
  const removeContactPhone = (index: number) => {
    const newContactPhones = contactPhones.filter((_, i) => i !== index);
    setContactPhones(newContactPhones);
  };

  // Update contact phone
  const updateContactPhone = (index: number, value: string) => {
    const newContactPhones = [...contactPhones];
    newContactPhones[index] = value;
    setContactPhones(newContactPhones);
  };

  // Handle Enter key press - prevent default behavior
  const handleEnterKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Prevent form submission and any other default behavior
    }
  };

  // Validate GPS coordinates format
  const validateGPSCoordinates = (coords: string): boolean => {
    if (!coords.trim()) return true; // Empty is valid
    const pattern = /^-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*$/;
    return pattern.test(coords.trim());
  };

  // Get coordinates from city and country
  const getCoordinatesFromLocation = async (index: number) => {
    const location = locations[index];
    if (!location.city || !location.country) {
      toast({
        title: "Error",
        description: "Please enter both city and country first",
        variant: "destructive"
      });
      return;
    }

    setIsGeocodingLoading(true);
    try {
      const response = await supabase.functions.invoke('geocode-location', {
        body: {
          city: location.city,
          country: location.country
        }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Error getting coordinates');
      }

      if (response.data && response.data.coordinates) {
        const newLocations = [...locations];
        newLocations[index].gps_coordinates = response.data.coordinates;
        setLocations(newLocations);
        toast({
          title: "Success",
          description: `Coordinates found: ${response.data.place_name}`
        });
      } else {
        toast({
          title: "Error",
          description: "No coordinates found for this location",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error getting coordinates:', error);
      toast({
        title: "Error",
        description: "Error getting coordinates. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsGeocodingLoading(false);
    }
  };

  // Check if certifications have changed
  function hasCertificationsChanges(): boolean {
    if (!companyData?.certifications) return certifications.length > 0;
    const originalCertifications = Array.isArray(companyData.certifications) ? companyData.certifications : [];
    return JSON.stringify(certifications) !== JSON.stringify(originalCertifications);
  }

  // Check if main customers have changed
  function hasMainCustomersChanges(): boolean {
    if (!companyData?.main_customers) return mainCustomers.length > 0;
    const originalMainCustomers = Array.isArray(companyData.main_customers) ? companyData.main_customers : [];
    return JSON.stringify(mainCustomers) !== JSON.stringify(originalMainCustomers);
  }

  // Check if contact emails have changed
  function hasContactEmailsChanges(): boolean {
    if (!companyData?.contact_emails) return contactEmails.length > 0;
    const originalContactEmails = Array.isArray(companyData.contact_emails) ? companyData.contact_emails : [];
    return JSON.stringify(contactEmails) !== JSON.stringify(originalContactEmails);
  }

  // Check if contact phones have changed
  function hasContactPhonesChanges(): boolean {
    if (!companyData?.contact_phones) return contactPhones.length > 0;
    const originalContactPhones = Array.isArray(companyData.contact_phones) ? companyData.contact_phones : [];
    return JSON.stringify(contactPhones) !== JSON.stringify(originalContactPhones);
  }

  // Track if we have pending changes (form changes OR uploaded logo OR revenue changes OR location changes OR certifications changes OR main customers changes OR contact changes)
  const hasPendingChanges = useMemo(() => {
    return isDirty || uploadedLogo !== null || hasRevenueChanges() || hasLocationChanges() || hasCertificationsChanges() || hasMainCustomersChanges() || hasContactEmailsChanges() || hasContactPhonesChanges();
  }, [isDirty, uploadedLogo, revenues, locations, certifications, mainCustomers, contactEmails, contactPhones, companyData]);

  // Format number with commas
  const formatNumberWithCommas = (value: string): string => {
    // Remove all non-numeric characters except decimal point
    const cleaned = value.replace(/[^0-9.]/g, '');
    
    // Handle decimal point - only allow one and max 2 digits after
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      // If more than one decimal point, keep only the first one
      return parts[0] + '.' + parts.slice(1).join('').substring(0, 2);
    }
    
    let integerPart = parts[0];
    let decimalPart = parts[1];
    
    // Limit decimal part to 2 digits
    if (decimalPart && decimalPart.length > 2) {
      decimalPart = decimalPart.substring(0, 2);
    }
    
    // Add commas to integer part
    if (integerPart.length > 3) {
      integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    
    // Return formatted number
    if (decimalPart !== undefined) {
      return integerPart + '.' + decimalPart;
    }
    
    return integerPart;
  };

  

  // Handle logo file selection
  const handleLogoSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size (1MB = 1048576 bytes)
    if (file.size > 1048576) {
      toast({
        title: "File too large",
        description: "Logo file must be less than 1 MB",
        variant: "destructive"
      });
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file",
        variant: "destructive"
      });
      return;
    }

    setUploadedLogo(file);
    
    // Create preview URL
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    
    
  };

  // Remove uploaded logo
  const removeUploadedLogo = () => {
    setUploadedLogo(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  // Upload logo to storage
  const uploadLogo = async (): Promise<string | null> => {
    if (!uploadedLogo || !companyId) return null;

    try {
      setIsUploadingLogo(true);
      
      const fileExt = uploadedLogo.name.split('.').pop();
      const fileName = `${companyId}/logo.${fileExt}`;
      
      // Delete existing logo if it exists
      await supabase.storage
        .from('company-logos')
        .remove([fileName]);
      
      // Upload new logo
      const { data, error } = await supabase.storage
        .from('company-logos')
        .upload(fileName, uploadedLogo, {
          upsert: true
        });

      if (error) {
        console.error('Error uploading logo:', error);
        toast({
          title: "Upload failed",
          description: "Failed to upload logo. Please try again.",
          variant: "destructive"
        });
        return null;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('company-logos')
        .getPublicUrl(data.path);

      return publicUrl;
    } catch (error) {
      console.error('Error in uploadLogo:', error);
      return null;
    } finally {
      setIsUploadingLogo(false);
    }
  };

  // Fetch company data
  const fetchCompanyData = async () => {
    if (!companyId) return;
    
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('company_revision')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        console.error('Error fetching company data:', error);
        toast({
          title: "Error",
          description: "Failed to load company data",
          variant: "destructive"
        });
        return;
      }

      if (data) {
        setCompanyData(data);
        setCurrentCompanySlug(data.slug || null);
        
        // Parse locations data
        const locationsData = parseExistingLocationData(data);
        setLocations(locationsData);
        
        // Parse revenues data
        const revenuesData = Array.isArray(data.revenues) 
          ? data.revenues.map((r: any) => ({
              year: r.year || '',
              amount: r.amount?.replace(/[€$]/g, '') || '',
              currency: r.currency || '$'
            }))
          : [];
        setRevenues(revenuesData);
        
        // Parse certifications data
        const certificationsData = Array.isArray(data.certifications) 
          ? data.certifications.map((cert: any) => String(cert))
          : [];
        setCertifications(certificationsData);
        
        // Parse main customers data
        const mainCustomersData = Array.isArray(data.main_customers) 
          ? data.main_customers.map((customer: any) => String(customer))
          : [];
        setMainCustomers(mainCustomersData);
        
        // Parse contact emails data
        const contactEmailsData = Array.isArray(data.contact_emails) 
          ? data.contact_emails.map((email: any) => String(email))
          : [];
        setContactEmails(contactEmailsData);
        
        // Parse contact phones data
        const contactPhonesData = Array.isArray(data.contact_phones) 
          ? data.contact_phones.map((phone: any) => String(phone))
          : [];
        setContactPhones(contactPhonesData);
        
        // Set global currency from first revenue entry or default
        if (revenuesData.length > 0) {
          setGlobalCurrency(revenuesData[0].currency);
        }
        
        reset({
          nombre_empresa: data.nombre_empresa || '',
          description: data.description || '',
          main_activities: data.main_activities || '',
          strengths: data.strengths || '',
          sectors: data.sectors || '',
          website: data.website || '',
          logo: data.logo || '',
          youtube_url: data.youtube_url || ''
        });
      }
    } catch (error) {
      console.error('Error in fetchCompanyData:', error);
      toast({
        title: "Error",
        description: "Unexpected error while loading company data",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isApprovedAdmin && companyId) {
      fetchCompanyData();
    } else if (!isLoading) {
      setIsLoading(false);
    }
  }, [isApprovedAdmin, companyId]);

  // Auto-open company auto-fill modal when query param is present
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const open = params.get('openAutoFillCompany') === 'true';
      if (open) {
        setIsCompanyAutoFillOpen(true);
      }
    } catch {}
  }, []);

  const onSubmit = async (data: CompanyFormData) => {
    // Show comment modal before saving
    setIsCommentModalOpen(true);
  };

  const saveWithComment = async (comment: string): Promise<string | void> => {
    const data = watch(); // Get current form data
    if (!companyData || !user) return;

    try {
      setIsSaving(true);

      // Step 1: Upload logo if there's a new one
      let logoUrl = data.logo;
      if (uploadedLogo) {
        const uploadedUrl = await uploadLogo();
        if (uploadedUrl) {
          logoUrl = uploadedUrl;
        }
      }

      

      // Step 2: Use the SECURITY DEFINER function to deactivate revisions and clear slugs
      const { error: rpcError } = await supabase.rpc('deactivate_company_revisions', {
        p_company_id: companyData.company_id,
        p_user_id: user.id
      });

      if (rpcError) {
        console.error('❌ Error deactivating old revisions:', rpcError);
        toast({
          title: "Error",
          description: `Failed to deactivate old revisions: ${rpcError.message}`,
          variant: "destructive"
        });
        return;
      }

      

      // Step 3: Save new revision with is_active = true
      const locationData = formatLocationDataForSave();
      
      const newRevisionData = {
        company_id: companyData.company_id,
        nombre_empresa: data.nombre_empresa,
        description: data.description || null,
        main_activities: data.main_activities || null,
        strengths: data.strengths || null,
        sectors: data.sectors || null,
        website: data.website || null,
        youtube_url: data.youtube_url || null,
        logo: logoUrl || null,
        countries: locationData.countries.length > 0 ? locationData.countries : null,
        cities: locationData.cities.length > 0 ? locationData.cities : null,
        gps_coordinates: locationData.gps_coordinates.length > 0 ? locationData.gps_coordinates : null,
        revenues: revenues.filter(r => r.year && r.amount).length > 0 ? revenues.filter(r => r.year && r.amount) : null,
        certifications: certifications.filter(cert => cert.trim()).length > 0 ? certifications.filter(cert => cert.trim()) : null,
        main_customers: mainCustomers.filter(customer => customer.trim()).length > 0 ? mainCustomers.filter(customer => customer.trim()) : null,
        contact_emails: contactEmails.filter(email => email.trim()).length > 0 ? contactEmails.filter(email => email.trim()) : null,
        contact_phones: contactPhones.filter(phone => phone.trim()).length > 0 ? contactPhones.filter(phone => phone.trim()) : null,
        comment: comment?.trim() || null,
        is_active: true, // Make this revision active
        source: 'member',
        created_by: user.id // Save the author of the revision
      } as any;

      const { data: insertData, error: insertError } = await supabase
        .from('company_revision')
        .insert(newRevisionData)
        .select('id')
        .single();

      if (insertError) {
        console.error('❌ Error creating new revision:', insertError);
        toast({
          title: "Error",
          description: `Failed to save company data: ${insertError.message}`,
          variant: "destructive"
        });
        return;
      }

      

      // Step 4: Record the activation in the activations table
      if (insertData?.id) {
        
        const { error: activationLogError } = await supabase
          .from('company_revision_activations')
          .insert({
            company_revision_id: insertData.id,
            activated_by: user.id
          });
        
        if (activationLogError) {
          console.error('❌ Error logging new revision activation:', activationLogError);
          // Don't return here - the revision is already created, just log the error
        } else {
          
        }
      } else {
        console.error('❌ No insertData.id available for logging activation');
      }

      toast({
        title: "Success", 
        description: "Company information has been saved successfully."
      });

      // Clear uploaded logo state
      setUploadedLogo(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }

      // Return the revision ID for embedding generation
      const revisionId = insertData?.id;

      return revisionId;
    } catch (error) {
      console.error('Error updating company:', error);
      toast({
        title: "Error",
        description: "Unexpected error. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isApprovedAdmin) {
    return (
      <div className="flex-1 bg-background min-h-screen overflow-auto">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            <Card>
              <CardContent className="p-8 text-center">
                <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h2 className="text-xl font-semibold mb-2">Access Required</h2>
                <p className="text-muted-foreground">
                  You need to be an approved admin to edit company information.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 bg-background min-h-screen overflow-auto">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            <Card>
              <CardContent className="p-8 text-center">
                <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin" />
                <p>Loading company data...</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (!companyData) {
    return (
      <div className="flex-1 bg-background min-h-screen overflow-auto">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            <Card>
              <CardContent className="p-8 text-center">
                <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h2 className="text-xl font-semibold mb-2">No Company Data</h2>
                <p className="text-muted-foreground">
                  No company data found to edit.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-background min-h-screen overflow-auto">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <form onSubmit={handleSubmit(onSubmit)}>
            {/* Header with back button, company logo and save button */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <Button 
                  type="button"
                  variant="outline" 
                  size="sm"
                  className="mr-2"
                  onClick={() => {
                    if (currentCompanySlug) {
                      navigate(`/suppliers/${currentCompanySlug}?tab=manage&subtab=company-info`);
                    } else if (companyId) {
                      navigate(`/suppliers/${companyId}?tab=manage&subtab=company-info`);
                    } else {
                      navigate(-1);
                    }
                  }}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                  {previewUrl ? (
                    <img 
                      src={previewUrl} 
                      alt="Company logo preview" 
                      className="w-full h-full object-contain"
                    />
                  ) : logoUrl || companyData.logo ? (
                    <img 
                      src={logoUrl || companyData.logo} 
                      alt="Company logo" 
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <Building2 className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <div className="mb-2">
                    <h1 className="text-2xl font-extrabold text-foreground">
                      {companyData.nombre_empresa}
                    </h1>
                  </div>
                  {locations.length > 0 && locations[0].city && locations[0].country && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      <span className="text-sm">{locations[0].city}, {locations[0].country}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    const form = watch();
                    const loc = formatLocationDataForSave();
                    const rev: any = {
                      id: 'preview',
                      company_id: companyId,
                      nombre_empresa: form.nombre_empresa || companyData?.nombre_empresa || '',
                      description: form.description || null,
                      main_activities: form.main_activities || null,
                      strengths: form.strengths || null,
                      sectors: form.sectors || null,
                      website: form.website || null,
                      youtube_url: form.youtube_url || null,
                      logo: previewUrl || form.logo || companyData?.logo || null,
                      countries: loc.countries.length > 0 ? loc.countries : null,
                      cities: loc.cities.length > 0 ? loc.cities : null,
                      gps_coordinates: loc.gps_coordinates.length > 0 ? loc.gps_coordinates : null,
                      revenues: revenues.filter(r => r.year && r.amount),
                      certifications: certifications.filter(c => c.trim()),
                      main_customers: mainCustomers.filter(c => c.trim()),
                      contact_emails: contactEmails.filter(e => e.trim()),
                      contact_phones: contactPhones.filter(p => p.trim()),
                      created_at: new Date().toISOString(),
                      is_active: false,
                      source: 'member',
                      creator_name: (user as any)?.user_metadata?.full_name || null
                    };
                    setPreviewRevision(rev);
                    setIsPreviewOpen(true);
                  }}
                >
                  <Eye className="h-4 w-4" />
                  Preview
                </Button>
                <Button 
                  type="submit" 
                  disabled={!hasPendingChanges || isSaving || isUploadingLogo}
                  className="gap-2"
                >
                  {isSaving || isUploadingLogo ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {isUploadingLogo ? 'Uploading...' : 'Save Changes'}
                </Button>
              </div>
            </div>

            {/* Tabs */}
            <div className="w-full">

              <div className="space-y-6 mt-6">
                {/* Company Information - Combined Card */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        Company Information
                      </CardTitle>
                      <Button
                        type="button"
                        variant="default"
                        onClick={() => setIsCompanyAutoFillOpen(true)}
                        className="gap-2 bg-sky text-navy hover:bg-sky-dark"
                      >
                        <Sparkles className="h-4 w-4" />
                        Update info using Qanvit AI
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Company Name */}
                    <div className="space-y-2">
                      <Label htmlFor="nombre_empresa" className="text-sm font-medium flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Company Name
                      </Label>
                       <Input
                         {...register('nombre_empresa', { required: 'Company name is required' })}
                         onKeyDown={handleEnterKeyPress}
                         className="text-lg font-semibold"
                         placeholder="Enter company name"
                       />
                      {errors.nombre_empresa && (
                        <p className="text-sm text-destructive mt-1">{errors.nombre_empresa.message}</p>
                      )}
                    </div>

                    {/* Company Logo */}
                    <div className="space-y-2">
                      <Label htmlFor="logo" className="text-sm font-medium flex items-center gap-2">
                        <Image className="h-4 w-4" />
                        Company Logo
                      </Label>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Current Logo Display */}
                        <div className="space-y-3">
                          <Label className="text-sm text-muted-foreground">Current Logo</Label>
                          <div className="aspect-square max-w-32 bg-muted rounded-lg flex items-center justify-center overflow-hidden border-2 border-dashed border-muted-foreground/25">
                            {previewUrl ? (
                              <img 
                                src={previewUrl} 
                                alt="Logo preview" 
                                className="w-full h-full object-contain"
                              />
                            ) : logoUrl || companyData.logo ? (
                              <img 
                                src={logoUrl || companyData.logo} 
                                alt="Current logo" 
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <Building2 className="h-12 w-12 text-muted-foreground/50" />
                            )}
                          </div>
                          {uploadedLogo && (
                            <p className="text-xs text-muted-foreground">
                              New file: {uploadedLogo.name} ({Math.round(uploadedLogo.size / 1024)}KB)
                            </p>
                          )}
                        </div>
                        
                         {/* Upload Options */}
                         <div className="space-y-3">
                           <Label className="text-sm font-medium">Upload New Logo</Label>
                           <input
                             type="file"
                             id="logo-upload"
                             accept="image/*"
                             onChange={handleLogoSelect}
                             className="hidden"
                           />
                           <div className="flex flex-col gap-2">
                             <Button
                               type="button"
                               variant="outline"
                               onClick={() => document.getElementById('logo-upload')?.click()}
                               className="gap-2 w-full"
                               disabled={isUploadingLogo}
                             >
                               <Upload className="h-4 w-4" />
                               Upload Logo (Max 1MB)
                             </Button>
                             {uploadedLogo && (
                               <Button
                                 type="button"
                                 variant="outline"
                                 size="sm"
                                 onClick={removeUploadedLogo}
                                 className="gap-1 w-full"
                               >
                                 <X className="h-3 w-3" />
                                 Remove Selected File
                               </Button>
                             )}
                           </div>
                         </div>
                      </div>
                    </div>

                    {/* Website */}
                    <div className="space-y-2">
                      <Label htmlFor="website" className="text-sm font-medium flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        Website
                      </Label>
                       <Input
                         id="website"
                         {...register('website')}
                         onKeyDown={handleEnterKeyPress}
                         placeholder="https://www.example.com"
                         type="url"
                       />
                    </div>

                    {/* YouTube Video URL */}
                    <div className="space-y-2">
                      <Label htmlFor="youtube_url" className="text-sm font-medium flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        YouTube Video URL
                      </Label>
                       <Input
                         id="youtube_url"
                         {...register('youtube_url')}
                         onKeyDown={handleEnterKeyPress}
                         placeholder="https://www.youtube.com/watch?v=..."
                         type="url"
                       />
                    </div>

                    {/* Locations Table */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          Company Locations
                        </Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addLocation}
                          className="gap-1"
                        >
                          <Plus className="h-3 w-3" />
                          Add Location
                        </Button>
                      </div>
                      
                      <div className="border rounded-lg overflow-hidden">
                        <div className="bg-muted/50 grid grid-cols-4 gap-4 p-3 text-sm font-medium">
                          <div>Country</div>
                          <div>City</div>
                          <div>GPS Coordinates</div>
                          <div className="text-center">Actions</div>
                        </div>
                        
                        {locations.map((location, index) => (
                          <div key={index} className="grid grid-cols-4 gap-4 p-3 border-t bg-background items-center">
                             <div className="flex flex-col">
                                <Input
                                  value={location.country}
                                  onChange={(e) => {
                                    const newLocations = [...locations];
                                    newLocations[index].country = e.target.value;
                                    setLocations(newLocations);
                                  }}
                                  onKeyDown={handleEnterKeyPress}
                                  placeholder="Country"
                                  className="text-sm"
                                />
                               {index === 0 && (
                                 <Badge variant="secondary" className="text-xs px-1 py-0 mt-1 self-start">
                                   Headquarters
                                 </Badge>
                               )}
                             </div>
                             
                             <Input
                               value={location.city}
                               onChange={(e) => {
                                 const newLocations = [...locations];
                                 newLocations[index].city = e.target.value;
                                 setLocations(newLocations);
                               }}
                               placeholder="City"
                               className="text-sm"
                             />
                             
                             <div className="space-y-1">
                               <Input
                                 value={location.gps_coordinates}
                                 onChange={(e) => {
                                   const newLocations = [...locations];
                                   newLocations[index].gps_coordinates = e.target.value;
                                   setLocations(newLocations);
                                 }}
                                 placeholder="lat,lng"
                                 className="text-sm"
                               />
                               {location.gps_coordinates && !validateGPSCoordinates(location.gps_coordinates) && (
                                 <p className="text-xs text-destructive">Invalid format (use: lat,lng)</p>
                               )}
                             </div>
                             
                               <div className="flex flex-col gap-1 items-center">
                                 <Button
                                   type="button"
                                   variant="outline"
                                   size="sm"
                                   onClick={() => getCoordinatesFromLocation(index)}
                                   disabled={!location.city || !location.country || isGeocodingLoading}
                                   className="gap-1 px-2 text-xs"
                                   title="Get approximate coordinates based on city and country"
                                 >
                                   {isGeocodingLoading ? (
                                     <Loader2 className="h-3 w-3 animate-spin" />
                                   ) : (
                                     <MapPin className="h-3 w-3" />
                                   )}
                                   Get coordinates
                                 </Button>
                                 {index === 0 ? (
                                   <Badge variant="outline" className="text-xs">
                                     HQ
                                   </Badge>
                                 ) : (
                                   <Button
                                     type="button"
                                     variant="outline"
                                     size="sm"
                                     onClick={() => removeLocation(index)}
                                     className="text-destructive hover:text-destructive"
                                   >
                                     <Trash2 className="h-3 w-3" />
                                   </Button>
                                 )}
                               </div>
                          </div>
                        ))}
                        
                        {locations.length === 0 && (
                          <div className="p-6 text-center text-muted-foreground border-t">
                            <Navigation className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No locations added yet</p>
                            <p className="text-xs">Click "Add Location" to add your headquarters</p>
                          </div>
                        )}
                      </div>
                      
                      <p className="text-xs text-muted-foreground">
                        The first location represents your company headquarters. GPS coordinates should be in the format: latitude,longitude (e.g., 51.4416, 5.4697)
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Company Details */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Company Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="description" className="text-sm font-medium flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Company Overview
                        </Label>
                         <Textarea
                           id="description"
                           {...register('description')}
                           onKeyDown={handleEnterKeyPress}
                           placeholder="Describe your company..."
                           rows={4}
                           className="resize-none"
                         />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="main_activities" className="text-sm font-medium flex items-center gap-2">
                          <Target className="h-4 w-4" />
                          Core Activities
                        </Label>
                         <Textarea
                           id="main_activities"
                           {...register('main_activities')}
                           onKeyDown={handleEnterKeyPress}
                           placeholder="Describe your main business activities..."
                           rows={3}
                           className="resize-none"
                         />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="strengths" className="text-sm font-medium flex items-center gap-2">
                          <Trophy className="h-4 w-4" />
                          Strengths
                        </Label>
                         <Textarea
                           id="strengths"
                           {...register('strengths')}
                           onKeyDown={handleEnterKeyPress}
                           placeholder="What are your company's key strengths?"
                           rows={3}
                           className="resize-none"
                         />
                       </div>

                       <div className="space-y-2">
                         <Label htmlFor="sectors" className="text-sm font-medium flex items-center gap-2">
                           <Factory className="h-4 w-4" />
                           Industries
                         </Label>
                         <Input
                           id="sectors"
                           {...register('sectors')}
                           onKeyDown={handleEnterKeyPress}
                           placeholder="e.g., Machine Vision, Healthcare, Global Security"
                         />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Revenue Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5" />
                      Revenue Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Global Currency Selector */}
                    <div className="pb-4 border-b">
                      <div className="flex items-center gap-4">
                        <Label className="text-sm font-medium">Currency for all revenues:</Label>
                        <Select
                          value={globalCurrency}
                          onValueChange={(value) => {
                            setGlobalCurrency(value);
                            // Update all existing revenues with new currency
                            const updatedRevenues = revenues.map(r => ({ ...r, currency: value }));
                            setRevenues(updatedRevenues);
                          }}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="$">USD ($)</SelectItem>
                            <SelectItem value="€">EUR (€)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {revenues.map((revenue, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 border rounded-lg bg-muted/50">
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label className="text-sm">Year</Label>
                            <Input
                              value={revenue.year}
                              onChange={(e) => {
                                const newRevenues = [...revenues];
                                newRevenues[index].year = e.target.value;
                                setRevenues(newRevenues);
                              }}
                              placeholder="2024"
                              type="number"
                              min="2000"
                              max="2030"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm">Amount ({globalCurrency})</Label>
                            <Input
                              value={revenue.amount}
                              onChange={(e) => {
                                const newRevenues = [...revenues];
                                const formattedValue = formatNumberWithCommas(e.target.value);
                                newRevenues[index].amount = formattedValue;
                                newRevenues[index].currency = globalCurrency;
                                setRevenues(newRevenues);
                              }}
                               onKeyDown={handleEnterKeyPress}
                               placeholder="6,300,000.00"
                            />
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const newRevenues = revenues.filter((_, i) => i !== index);
                            setRevenues(newRevenues);
                          }}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setRevenues([...revenues, { year: '', amount: '', currency: globalCurrency }]);
                      }}
                      className="w-full gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Add Revenue Year
                    </Button>
                  </CardContent>
                </Card>

                {/* Certifications */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Award className="h-5 w-5" />
                      Certifications
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {certifications.map((certification, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 border rounded-lg bg-muted/50">
                        <div className="flex-1">
                          <Input
                            value={certification}
                            onChange={(e) => updateCertification(index, e.target.value)}
                            onKeyDown={handleEnterKeyPress}
                            placeholder="e.g., ISO 9001:2015, ISO 14001:2015, CE Marking"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeCertification(index)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    
                    {certifications.length === 0 && (
                      <div className="p-6 text-center text-muted-foreground border rounded-lg bg-muted/30">
                        <Award className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No certifications added yet</p>
                        <p className="text-xs">Add quality, environmental, or industry certifications</p>
                      </div>
                    )}
                    
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addCertification}
                      className="w-full gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Add Certification
                    </Button>
                  </CardContent>
                </Card>

                {/* Main Customers */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Main Customers
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {mainCustomers.map((customer, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 border rounded-lg bg-muted/50">
                        <div className="flex-1">
                          <Input
                            value={customer}
                            onChange={(e) => updateMainCustomer(index, e.target.value)}
                            onKeyDown={handleEnterKeyPress}
                            placeholder="e.g., Company Name, Government Agency, Industry Leader"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeMainCustomer(index)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    
                    {mainCustomers.length === 0 && (
                      <div className="p-6 text-center text-muted-foreground border rounded-lg bg-muted/30">
                        <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No main customers added yet</p>
                        <p className="text-xs">Add your top 10 most important customers or clients</p>
                      </div>
                    )}
                    
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addMainCustomer}
                      disabled={mainCustomers.length >= 10}
                      className="w-full gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Add Main Customer {mainCustomers.length >= 10 ? "(Max 10)" : `(${mainCustomers.length}/10)`}
                    </Button>
                  </CardContent>
                </Card>

                {/* Contact Emails */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Mail className="h-5 w-5" />
                      Contact Emails
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {contactEmails.map((email, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 border rounded-lg bg-muted/50">
                        <div className="flex-1">
                          <Input
                            type="email"
                            value={email}
                            onChange={(e) => updateContactEmail(index, e.target.value)}
                            placeholder="Enter contact email"
                            className="border-0 bg-transparent p-0 focus-visible:ring-0"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeContactEmail(index)}
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    
                    {contactEmails.length === 0 && (
                      <div className="p-6 text-center text-muted-foreground border rounded-lg bg-muted/30">
                        <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No contact emails added yet</p>
                        <p className="text-xs">Add email addresses for business contact</p>
                      </div>
                    )}
                    
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addContactEmail}
                      className="w-full gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Add Contact Email
                    </Button>
                  </CardContent>
                </Card>

                {/* Contact Phones */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Phone className="h-5 w-5" />
                      Contact Phones
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {contactPhones.map((phone, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 border rounded-lg bg-muted/50">
                        <div className="flex-1">
                          <Input
                            type="tel"
                            value={phone}
                            onChange={(e) => updateContactPhone(index, e.target.value)}
                            placeholder="Enter contact phone number"
                            className="border-0 bg-transparent p-0 focus-visible:ring-0"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeContactPhone(index)}
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    
                    {contactPhones.length === 0 && (
                      <div className="p-6 text-center text-muted-foreground border rounded-lg bg-muted/30">
                        <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No contact phones added yet</p>
                        <p className="text-xs">Add phone numbers for business contact</p>
                      </div>
                    )}
                    
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addContactPhone}
                      className="w-full gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Add Contact Phone
                    </Button>
                  </CardContent>
                </Card>

                {/* Bottom Save Button */}
                <div className="flex justify-end pt-4">
                  <Button 
                    type="submit" 
                    disabled={!hasPendingChanges || isSaving || isUploadingLogo}
                    className="gap-2"
                  >
                    {isSaving || isUploadingLogo ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {isUploadingLogo ? 'Uploading...' : 'Save Changes'}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Comment Modal */}
      <CompanyCommentModal
        isOpen={isCommentModalOpen}
        onClose={() => {
          setIsCommentModalOpen(false);
          if (currentCompanySlug) {
            navigate(`/suppliers/${currentCompanySlug}?tab=manage&subtab=company-info`);
          } else if (companyId) {
            navigate(`/suppliers/${companyId}?tab=manage&subtab=company-info`);
          } else {
            navigate(-1);
          }
        }}
        onSave={saveWithComment}
        isSaving={isSaving}
      />

      <CompanyRevisionPreviewModal
        revision={previewRevision}
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
      />

      {/* Company Auto-fill Modal */}
      <CompanyAutoFillModal
        isOpen={isCompanyAutoFillOpen}
        onClose={() => setIsCompanyAutoFillOpen(false)}
        companyId={companyId || undefined}
        onResult={(data) => {
          // Map WS result to form state for user review
          if (data?.nombre_empresa) setValue('nombre_empresa', data.nombre_empresa);
          if (typeof data?.description === 'string') setValue('description', data.description || '');
          if (typeof data?.main_activities === 'string') setValue('main_activities', data.main_activities || '');
          if (typeof data?.strengths === 'string') setValue('strengths', data.strengths || '');
          if (typeof data?.sectors === 'string') setValue('sectors', data.sectors || '');

          // Optional: Map contacts (keep within form-only state arrays)
          if (Array.isArray(data?.contact_emails)) setContactEmails(data.contact_emails.map(String).slice(0, 10));
          if (Array.isArray(data?.contact_phones)) setContactPhones(data.contact_phones.map(String).slice(0, 10));

          // Optional: Map simple arrays
          if (Array.isArray(data?.certifications)) setCertifications(data.certifications.map(String));
          if (Array.isArray(data?.main_customers)) setMainCustomers(data.main_customers.map(String).slice(0, 10));

          // Optional: countries/cities -> first HQ row if both present
          const countries = Array.isArray(data?.countries) ? data.countries : [];
          const cities = Array.isArray(data?.cities) ? data.cities : [];
          const gps = Array.isArray(data?.gps_coordinates) ? data.gps_coordinates : [];
          const newLocations: LocationEntry[] = [];
          const maxLen = Math.max(countries.length, cities.length, gps.length);
          for (let i = 0; i < maxLen; i++) {
            newLocations.push({
              country: (countries[i] || '').toString(),
              city: (cities[i] || '').toString(),
              gps_coordinates: (gps[i] || '').toString(),
            });
          }
          if (newLocations.length > 0) {
            setLocations(newLocations);
          }
        }}
      />
    </div>
  );
};

export default CompanyEditForm;