import React, { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Building2, MapPin, Globe, Save, Image, Loader2, Upload, X, Plus, Trash2, DollarSign, Navigation, FileText, Target, Trophy, Factory, Award, Users, Mail, Phone, ArrowLeft } from 'lucide-react';
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
import { useNavigate } from 'react-router-dom';
import { useIsDeveloper } from '@/hooks/useIsDeveloper';

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
  url_root: string;
  role: 'supplier' | 'buyer';
  youtube_url: string;
}

const CreateCompanyManual = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { isDeveloper, loading: developerLoading } = useIsDeveloper();
  
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

  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors }
  } = useForm<CompanyFormData>({
    defaultValues: {
      nombre_empresa: '',
      description: '',
      main_activities: '',
      strengths: '',
      sectors: '',
      website: '',
      url_root: '',
      role: 'supplier',
      youtube_url: ''
    }
  });

  // Check if user is developer
  if (developerLoading) {
    return (
      <div className="flex-1 bg-background min-h-screen overflow-auto">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            <Card>
              <CardContent className="p-8 text-center">
                <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin" />
                <p>Loading...</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (!isDeveloper) {
    return (
      <div className="flex-1 bg-background min-h-screen overflow-auto">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            <Card>
              <CardContent className="p-8 text-center">
                <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h2 className="text-xl font-semibold mb-2">Access Required</h2>
                <p className="text-muted-foreground">
                  You need to be a developer to create companies manually.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Add revenue entry
  const addRevenue = () => {
    if (revenues.length >= 10) {
      toast({
        title: "Limit reached",
        description: "You can add up to 10 revenue entries only",
        variant: "destructive"
      });
      return;
    }
    setRevenues([...revenues, { year: '', amount: '', currency: globalCurrency }]);
  };

  // Remove revenue entry
  const removeRevenue = (index: number) => {
    const newRevenues = revenues.filter((_, i) => i !== index);
    setRevenues(newRevenues);
  };

  // Update revenue entry
  const updateRevenue = (index: number, field: keyof RevenueEntry, value: string) => {
    const newRevenues = [...revenues];
    newRevenues[index] = { ...newRevenues[index], [field]: value };
    setRevenues(newRevenues);
  };

  // Add location entry
  const addLocation = () => {
    if (locations.length >= 10) {
      toast({
        title: "Limit reached",
        description: "You can add up to 10 locations only",
        variant: "destructive"
      });
      return;
    }
    setLocations([...locations, { country: '', city: '', gps_coordinates: '' }]);
  };

  // Remove location entry
  const removeLocation = (index: number) => {
    const newLocations = locations.filter((_, i) => i !== index);
    setLocations(newLocations);
  };

  // Update location entry
  const updateLocation = (index: number, field: keyof LocationEntry, value: string) => {
    const newLocations = [...locations];
    newLocations[index] = { ...newLocations[index], [field]: value };
    setLocations(newLocations);
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

  // Add certification
  const addCertification = () => {
    if (certifications.length >= 20) {
      toast({
        title: "Limit reached",
        description: "You can add up to 20 certifications only",
        variant: "destructive"
      });
      return;
    }
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

  // Add main customer
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

  // Add contact email
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

  // Add contact phone
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
  const uploadLogo = async (companyId: string): Promise<string | null> => {
    if (!uploadedLogo) return null;

    try {
      setIsUploadingLogo(true);
      
      const fileExt = uploadedLogo.name.split('.').pop();
      const fileName = `${companyId}/logo.${fileExt}`;
      
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

  // Format location data for save
  const formatLocationDataForSave = () => {
    const countries: string[] = [];
    const cities: string[] = [];
    const gps_coordinates: string[] = [];

    locations.forEach(loc => {
      if (loc.country) countries.push(loc.country);
      if (loc.city) cities.push(loc.city);
      if (loc.gps_coordinates) gps_coordinates.push(loc.gps_coordinates);
    });

    return { countries, cities, gps_coordinates };
  };

  // Generate slug from company name
  const generateSlug = (name: string): string => {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  // Handle form submission
  const onSubmit = async (data: CompanyFormData) => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be authenticated to create a company",
        variant: "destructive"
      });
      return;
    }

    if (!data.url_root.trim()) {
      toast({
        title: "Error",
        description: "Company URL is required",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);

    try {
      // Step 1: Create company record
      const { data: companyData, error: companyError } = await supabase
        .from('company')
        .insert({
          url_root: data.url_root.trim(),
          role: data.role
        })
        .select('id')
        .single();

      if (companyError) {
        console.error('Error creating company:', companyError);
        toast({
          title: "Error",
          description: `Failed to create company: ${companyError.message}`,
          variant: "destructive"
        });
        return;
      }

      const companyId = companyData.id;

      // Step 2: Upload logo if provided
      let logoUrl: string | null = null;
      if (uploadedLogo) {
        logoUrl = await uploadLogo(companyId);
      }

      // Step 3: Create company_revision record
      const locationData = formatLocationDataForSave();
      const slug = generateSlug(data.nombre_empresa || data.url_root);

      const newRevisionData = {
        company_id: companyId,
        nombre_empresa: data.nombre_empresa || null,
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
        is_active: true,
        source: 'member',
        created_by: user.id,
        slug: slug
      } as any;

      const { data: insertData, error: insertError } = await supabase
        .from('company_revision')
        .insert(newRevisionData)
        .select('id')
        .single();

      if (insertError) {
        console.error('Error creating company revision:', insertError);
        toast({
          title: "Error",
          description: `Failed to create company revision: ${insertError.message}`,
          variant: "destructive"
        });
        return;
      }

      // Step 4: Record the activation
      if (insertData?.id) {
        const { error: activationLogError } = await supabase
          .from('company_revision_activations')
          .insert({
            company_revision_id: insertData.id,
            activated_by: user.id
          });
        
        if (activationLogError) {
          console.error('Error logging activation:', activationLogError);
        }
      }

      toast({
        title: "Success",
        description: "Company created successfully!"
      });

      // Navigate back or to company detail
      navigate('/database-manager');
    } catch (error) {
      console.error('Error creating company:', error);
      toast({
        title: "Error",
        description: "Unexpected error. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 bg-background min-h-screen overflow-auto">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/database-manager')}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="bg-primary/10 p-2 rounded-full">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-foreground">Create Company Manually</h1>
                <p className="text-muted-foreground">Add a new company to the database</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)}>
            <Tabs defaultValue="basic" className="space-y-6">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="location">Location</TabsTrigger>
                <TabsTrigger value="financial">Financial</TabsTrigger>
                <TabsTrigger value="contact">Contact</TabsTrigger>
              </TabsList>

              {/* Basic Info Tab */}
              <TabsContent value="basic" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="h-5 w-5" />
                      Basic Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="url_root">Company URL *</Label>
                      <Input
                        id="url_root"
                        {...register('url_root', { required: 'Company URL is required' })}
                        placeholder="https://example.com"
                      />
                      {errors.url_root && (
                        <p className="text-sm text-destructive">{errors.url_root.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="role">Role *</Label>
                      <Controller
                        name="role"
                        control={control}
                        defaultValue="supplier"
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="supplier">Supplier</SelectItem>
                              <SelectItem value="buyer">Buyer</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="nombre_empresa">Company Name</Label>
                      <Input
                        id="nombre_empresa"
                        {...register('nombre_empresa')}
                        placeholder="Company Name"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="website">Website</Label>
                      <Input
                        id="website"
                        {...register('website')}
                        placeholder="https://example.com"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="youtube_url">YouTube URL</Label>
                      <Input
                        id="youtube_url"
                        {...register('youtube_url')}
                        placeholder="https://youtube.com/watch?v=..."
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="logo">Logo</Label>
                      <div className="flex items-center gap-4">
                        <Input
                          id="logo"
                          type="file"
                          accept="image/*"
                          onChange={handleLogoSelect}
                          className="hidden"
                        />
                        <Label htmlFor="logo" className="cursor-pointer">
                          <Button type="button" variant="outline" asChild>
                            <span>
                              <Upload className="h-4 w-4 mr-2" />
                              Upload Logo
                            </span>
                          </Button>
                        </Label>
                        {previewUrl && (
                          <div className="relative">
                            <img src={previewUrl} alt="Logo preview" className="h-16 w-16 object-cover rounded" />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute -top-2 -right-2 h-6 w-6"
                              onClick={removeUploadedLogo}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Details Tab */}
              <TabsContent value="details" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Company Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        {...register('description')}
                        placeholder="Company description"
                        rows={4}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="main_activities">Main Activities</Label>
                      <Textarea
                        id="main_activities"
                        {...register('main_activities')}
                        placeholder="Main activities and services"
                        rows={4}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="strengths">Strengths</Label>
                      <Textarea
                        id="strengths"
                        {...register('strengths')}
                        placeholder="Company strengths and competitive advantages"
                        rows={4}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sectors">Sectors</Label>
                      <Input
                        id="sectors"
                        {...register('sectors')}
                        placeholder="Sectors (comma-separated)"
                      />
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label>Certifications</Label>
                        <Button type="button" variant="outline" size="sm" onClick={addCertification}>
                          <Plus className="h-4 w-4 mr-2" />
                          Add
                        </Button>
                      </div>
                      {certifications.map((cert, index) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            value={cert}
                            onChange={(e) => updateCertification(index, e.target.value)}
                            placeholder="Certification name"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeCertification(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label>Main Customers</Label>
                        <Button type="button" variant="outline" size="sm" onClick={addMainCustomer}>
                          <Plus className="h-4 w-4 mr-2" />
                          Add
                        </Button>
                      </div>
                      {mainCustomers.map((customer, index) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            value={customer}
                            onChange={(e) => updateMainCustomer(index, e.target.value)}
                            placeholder="Customer name"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeMainCustomer(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Location Tab */}
              <TabsContent value="location" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5" />
                      Locations
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>Locations</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addLocation}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Location
                      </Button>
                    </div>
                    {locations.map((location, index) => (
                      <Card key={index} className="p-4">
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label>Country</Label>
                              <Input
                                value={location.country}
                                onChange={(e) => updateLocation(index, 'country', e.target.value)}
                                placeholder="Country"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>City</Label>
                              <Input
                                value={location.city}
                                onChange={(e) => updateLocation(index, 'city', e.target.value)}
                                placeholder="City"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>GPS Coordinates</Label>
                            <div className="flex gap-2">
                              <Input
                                value={location.gps_coordinates}
                                onChange={(e) => updateLocation(index, 'gps_coordinates', e.target.value)}
                                placeholder="lat,lng"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => getCoordinatesFromLocation(index)}
                                disabled={isGeocodingLoading}
                              >
                                <Navigation className="h-4 w-4 mr-2" />
                                Get GPS
                              </Button>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeLocation(index)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Financial Tab */}
              <TabsContent value="financial" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5" />
                      Financial Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Currency</Label>
                      <Select value={globalCurrency} onValueChange={setGlobalCurrency}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="$">USD ($)</SelectItem>
                          <SelectItem value="€">EUR (€)</SelectItem>
                          <SelectItem value="£">GBP (£)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Revenue Entries</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addRevenue}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Revenue
                      </Button>
                    </div>
                    {revenues.map((revenue, index) => (
                      <Card key={index} className="p-4">
                        <div className="grid grid-cols-3 gap-3">
                          <div className="space-y-2">
                            <Label>Year</Label>
                            <Input
                              value={revenue.year}
                              onChange={(e) => updateRevenue(index, 'year', e.target.value)}
                              placeholder="2024"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Amount</Label>
                            <Input
                              value={revenue.amount}
                              onChange={(e) => updateRevenue(index, 'amount', e.target.value)}
                              placeholder="1000000"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Currency</Label>
                            <Select
                              value={revenue.currency}
                              onValueChange={(value) => updateRevenue(index, 'currency', value)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="$">USD ($)</SelectItem>
                                <SelectItem value="€">EUR (€)</SelectItem>
                                <SelectItem value="£">GBP (£)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-3"
                          onClick={() => removeRevenue(index)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Remove
                        </Button>
                      </Card>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Contact Tab */}
              <TabsContent value="contact" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Mail className="h-5 w-5" />
                      Contact Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label>Contact Emails</Label>
                        <Button type="button" variant="outline" size="sm" onClick={addContactEmail}>
                          <Plus className="h-4 w-4 mr-2" />
                          Add Email
                        </Button>
                      </div>
                      {contactEmails.map((email, index) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            type="email"
                            value={email}
                            onChange={(e) => updateContactEmail(index, e.target.value)}
                            placeholder="email@example.com"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeContactEmail(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label>Contact Phones</Label>
                        <Button type="button" variant="outline" size="sm" onClick={addContactPhone}>
                          <Plus className="h-4 w-4 mr-2" />
                          Add Phone
                        </Button>
                      </div>
                      {contactPhones.map((phone, index) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            type="tel"
                            value={phone}
                            onChange={(e) => updateContactPhone(index, e.target.value)}
                            placeholder="+1234567890"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeContactPhone(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Submit Button */}
            <div className="flex justify-end gap-4 mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/database-manager')}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving || isUploadingLogo}>
                {isSaving || isUploadingLogo ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Create Company
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateCompanyManual;

