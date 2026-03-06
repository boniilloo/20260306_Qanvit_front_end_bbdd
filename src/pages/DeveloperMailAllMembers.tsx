import React, { ChangeEvent, useEffect, useMemo, useState } from "react";
import { Mail, Eye, Send, Save, Users, ImagePlus, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type SenderPreset = "contact" | "arturo" | "david" | "custom";

type Recipient = {
  id: string;
  email: string;
  selected: boolean;
};

type DeveloperMailResponse<T = unknown> = {
  success: boolean;
  error?: string;
  data?: T;
  pagination?: {
    hasMore?: boolean;
    nextCursorCreatedAt?: string | null;
    pageSize?: number;
  };
};

type InlineAsset = {
  cid: string;
  filename: string;
  mimeType: string;
  base64Content: string;
};

type MailHistoryItem = {
  id: string;
  created_at: string;
  sent_by: string;
  sent_by_name?: string | null;
  sent_by_surname?: string | null;
  sent_by_email?: string | null;
  from_email: string;
  subject: string;
  body_html: string;
  signature_html: string;
  recipient_count: number;
  bcc_emails: string[];
  inline_assets?: unknown;
  batches_sent: number;
};

const PRESET_SENDERS: Record<Exclude<SenderPreset, "custom">, string> = {
  contact: "contact@fqsource.com",
  arturo: "arturo.lopez@fqsource.com",
  david: "david.bonillo@fqsource.com",
};

const ALLOWED_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const normalizeCid = (value: string) => value.trim().replace(/^<|>$/g, "");

const extractCidRefs = (html: string): string[] => {
  const refs = new Set<string>();
  html.replace(/src=(["'])cid:([^"']+)\1/gi, (_full, _quote, cid) => {
    refs.add(normalizeCid(String(cid)));
    return _full;
  });
  return Array.from(refs);
};

const defaultBodyHtml = `<h1 style="margin:0 0 16px;">Hello from FQ Source</h1>
<p style="margin:0 0 12px;">Write your HTML message here.</p>`;

const DeveloperMailAllMembers = () => {
  const { toast } = useToast();

  const [senderPreset, setSenderPreset] = useState<SenderPreset>("contact");
  const [customSender, setCustomSender] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState(defaultBodyHtml);
  const [signatureHtml, setSignatureHtml] = useState("");
  const [bodyAssets, setBodyAssets] = useState<InlineAsset[]>([]);
  const [signatureAssets, setSignatureAssets] = useState<InlineAsset[]>([]);
  const [search, setSearch] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [history, setHistory] = useState<MailHistoryItem[]>([]);
  const [viewingHistoryItem, setViewingHistoryItem] = useState<MailHistoryItem | null>(null);
  const [loadingHistoryDetail, setLoadingHistoryDetail] = useState(false);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyCursorCreatedAt, setHistoryCursorCreatedAt] = useState<string | null>(null);

  const [loadingPage, setLoadingPage] = useState(true);
  const [savingSignature, setSavingSignature] = useState(false);
  const [sending, setSending] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);

  const resolvedFrom = useMemo(() => {
    if (senderPreset === "custom") return customSender.trim().toLowerCase();
    return PRESET_SENDERS[senderPreset];
  }, [senderPreset, customSender]);

  const filteredRecipients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return recipients;
    return recipients.filter((r) => r.email.toLowerCase().includes(q));
  }, [recipients, search]);

  const selectedCount = useMemo(
    () => recipients.filter((r) => r.selected).length,
    [recipients],
  );

  const finalHtml = useMemo(() => {
    const safeBody = bodyHtml.trim();
    const safeSignature = signatureHtml.trim();
    return `${safeBody}${safeSignature ? `<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;" />${safeSignature}` : ""}`;
  }, [bodyHtml, signatureHtml]);

  const previewHtml = useMemo(() => {
    const allAssets = [...bodyAssets, ...signatureAssets];
    const byCid = new Map(allAssets.map((asset) => [normalizeCid(asset.cid), asset]));
    return finalHtml.replace(/src=(["'])cid:([^"']+)\1/gi, (full, quote, cid) => {
      const asset = byCid.get(normalizeCid(String(cid)));
      if (!asset) return full;
      const dataUrl = `data:${asset.mimeType};base64,${asset.base64Content}`;
      return `src=${quote}${dataUrl}${quote}`;
    });
  }, [finalHtml, bodyAssets, signatureAssets]);

  const parseInlineAssets = (input: unknown): InlineAsset[] => {
    if (!Array.isArray(input)) return [];
    return input
      .map((item) => {
        const raw = item as Partial<InlineAsset>;
        if (!raw?.cid || !raw?.filename || !raw?.mimeType || !raw?.base64Content) return null;
        return {
          cid: normalizeCid(String(raw.cid)),
          filename: String(raw.filename),
          mimeType: String(raw.mimeType),
          base64Content: String(raw.base64Content),
        } satisfies InlineAsset;
      })
      .filter((asset): asset is InlineAsset => Boolean(asset));
  };

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("Invalid file result"));
          return;
        }
        const commaIndex = result.indexOf(",");
        if (commaIndex === -1) {
          reject(new Error("Invalid data URL"));
          return;
        }
        resolve(result.slice(commaIndex + 1));
      };
      reader.onerror = () => reject(reader.error || new Error("Unable to read file"));
      reader.readAsDataURL(file);
    });

  const escapeAttr = (value: string) => value.replace(/"/g, "&quot;");

  const removeCidFromHtml = (html: string, cid: string): string => {
    const escapedCid = normalizeCid(cid).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const imgRegex = new RegExp(`<img[^>]+src=["']cid:${escapedCid}["'][^>]*>`, "gi");
    return html.replace(imgRegex, "");
  };

  const getMissingCidRefs = (html: string, assets: InlineAsset[]): string[] => {
    const refs = extractCidRefs(html);
    const available = new Set(assets.map((a) => normalizeCid(a.cid)));
    return refs.filter((cid) => !available.has(cid));
  };

  const removeAsset = (target: "body" | "signature", cid: string) => {
    if (target === "body") {
      setBodyAssets((prev) => prev.filter((asset) => asset.cid !== cid));
      setBodyHtml((prev) => removeCidFromHtml(prev, cid));
      return;
    }
    setSignatureAssets((prev) => prev.filter((asset) => asset.cid !== cid));
    setSignatureHtml((prev) => removeCidFromHtml(prev, cid));
  };

  const handleImageUpload = async (target: "body" | "signature", e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newAssets: Array<InlineAsset & { appendSnippet: boolean }> = [];
    const currentAssets = target === "body" ? bodyAssets : signatureAssets;
    const currentHtml = target === "body" ? bodyHtml : signatureHtml;
    const unresolvedCidQueue = getMissingCidRefs(currentHtml, currentAssets);

    for (const file of files) {
      if (!ALLOWED_IMAGE_MIMES.has(file.type)) {
        toast({
          title: "Formato no permitido",
          description: `${file.name}: usa PNG, JPG, WEBP o GIF.`,
          variant: "destructive",
        });
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast({
          title: "Imagen demasiado grande",
          description: `${file.name}: máximo 2MB por imagen.`,
          variant: "destructive",
        });
        continue;
      }

      try {
        const base64Content = await readFileAsBase64(file);
        const mappedCid = unresolvedCidQueue.shift();
        const cid = mappedCid || `${target}-${Date.now()}-${crypto.randomUUID()}`;
        newAssets.push({
          cid,
          filename: file.name,
          mimeType: file.type,
          base64Content,
          appendSnippet: !mappedCid,
        });
      } catch (error) {
        console.error("Error reading image file:", error);
        toast({
          title: "Error leyendo imagen",
          description: `No se pudo procesar ${file.name}.`,
          variant: "destructive",
        });
      }
    }

    if (newAssets.length === 0) {
      e.target.value = "";
      return;
    }

    if (target === "body") {
      setBodyAssets((prev) => [...prev, ...newAssets]);
      setBodyHtml((prev) => {
        const snippets = newAssets
          .filter((asset) => asset.appendSnippet)
          .map((asset) => `<p><img src="cid:${asset.cid}" alt="${escapeAttr(asset.filename)}" style="max-width:100%;height:auto;" /></p>`)
          .join("\n");
        return snippets ? `${prev}\n${snippets}`.trim() : prev;
      });
    } else {
      setSignatureAssets((prev) => [...prev, ...newAssets]);
      setSignatureHtml((prev) => {
        const snippets = newAssets
          .filter((asset) => asset.appendSnippet)
          .map((asset) => `<p><img src="cid:${asset.cid}" alt="${escapeAttr(asset.filename)}" style="max-width:100%;height:auto;" /></p>`)
          .join("\n");
        return snippets ? `${prev}\n${snippets}`.trim() : prev;
      });
    }

    e.target.value = "";
  };

  const fetchHistory = async (mode: "reset" | "append" = "reset") => {
    if (mode === "reset") {
      setHistoryLoading(true);
      setHistoryCursorCreatedAt(null);
    } else {
      setHistoryLoadingMore(true);
    }
    try {
      const { data, error } = await supabase.functions.invoke("developer-mail-members", {
        body: {
          action: "listHistory",
          historyLimit: 20,
          historyCursorCreatedAt: mode === "append" ? historyCursorCreatedAt : null,
        },
      });
      if (error) throw error;
      const payload = data as DeveloperMailResponse<MailHistoryItem[]>;
      if (!payload?.success) throw new Error(payload?.error || "Could not load mail history");
      const pageItems = (payload.data || []).map((item) => ({
          ...item,
          bcc_emails: Array.isArray(item.bcc_emails) ? item.bcc_emails : [],
          inline_assets: parseInlineAssets(item.inline_assets),
        }));

      setHistory((prev) => (mode === "append" ? [...prev, ...pageItems] : pageItems));
      setHistoryHasMore(Boolean(payload.pagination?.hasMore));
      setHistoryCursorCreatedAt(payload.pagination?.nextCursorCreatedAt ?? null);
    } catch (error) {
      console.error("Failed to fetch mail history:", error);
      toast({
        title: "Error",
        description: "No se pudo cargar el histórico de correos.",
        variant: "destructive",
      });
    } finally {
      setHistoryLoading(false);
      setHistoryLoadingMore(false);
    }
  };

  const loadInitialData = async () => {
    setLoadingPage(true);
    try {
      const [recipientsResp, settingsResp, historyResp] = await Promise.all([
        supabase.functions.invoke("developer-mail-members", { body: { action: "listRecipients" } }),
        supabase.functions.invoke("developer-mail-members", { body: { action: "getSettings" } }),
        supabase.functions.invoke("developer-mail-members", { body: { action: "listHistory", historyLimit: 20 } }),
      ]);

      if (recipientsResp.error) {
        throw recipientsResp.error;
      }
      if (settingsResp.error) {
        throw settingsResp.error;
      }
      if (historyResp.error) {
        throw historyResp.error;
      }

      const recipientsPayload = recipientsResp.data as DeveloperMailResponse<Array<{ id: string; email: string }>>;
      const settingsPayload = settingsResp.data as DeveloperMailResponse<{ signatureHtml: string; signatureAssets?: unknown }>;
      const historyPayload = historyResp.data as DeveloperMailResponse<MailHistoryItem[]>;

      if (!recipientsPayload?.success) {
        throw new Error(recipientsPayload?.error || "Could not load recipients");
      }
      if (!settingsPayload?.success) {
        throw new Error(settingsPayload?.error || "Could not load mail settings");
      }
      if (!historyPayload?.success) {
        throw new Error(historyPayload?.error || "Could not load mail history");
      }

      const loaded = (recipientsPayload.data || [])
        .filter((r) => !!r.email)
        .map((r) => ({ id: r.id, email: r.email, selected: true }))
        .sort((a, b) => a.email.localeCompare(b.email));

      setRecipients(loaded);
      setSignatureHtml(settingsPayload.data?.signatureHtml || "");
      setSignatureAssets(parseInlineAssets(settingsPayload.data?.signatureAssets));
      setHistory(
        (historyPayload.data || []).map((item) => ({
          ...item,
          bcc_emails: Array.isArray(item.bcc_emails) ? item.bcc_emails : [],
          inline_assets: parseInlineAssets(item.inline_assets),
        })),
      );
      setHistoryHasMore(Boolean(historyPayload.pagination?.hasMore));
      setHistoryCursorCreatedAt(historyPayload.pagination?.nextCursorCreatedAt ?? null);
    } catch (error) {
      console.error("Failed to load developer mailing data:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los miembros o la firma global.",
        variant: "destructive",
      });
    } finally {
      setLoadingPage(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  const validateFrom = () => {
    if (!resolvedFrom) return false;
    return /^[^\s@]+@fqsource\.com$/i.test(resolvedFrom);
  };

  const toggleRecipient = (id: string, checked: boolean) => {
    setRecipients((prev) => prev.map((r) => (r.id === id ? { ...r, selected: checked } : r)));
  };

  const selectAll = () => {
    setRecipients((prev) => prev.map((r) => ({ ...r, selected: true })));
  };

  const deselectAll = () => {
    setRecipients((prev) => prev.map((r) => ({ ...r, selected: false })));
  };

  const saveSignature = async () => {
    const missingSignatureCids = getMissingCidRefs(signatureHtml, signatureAssets);
    if (missingSignatureCids.length > 0) {
      toast({
        title: "Faltan imágenes en la firma",
        description: `CID sin asset: ${missingSignatureCids.slice(0, 2).join(", ")}${missingSignatureCids.length > 2 ? "..." : ""}`,
        variant: "destructive",
      });
      return;
    }

    setSavingSignature(true);
    try {
      const { data, error } = await supabase.functions.invoke("developer-mail-members", {
        body: {
          action: "saveSettings",
          signatureHtml,
          signatureAssets,
        },
      });

      if (error) throw error;
      const payload = data as DeveloperMailResponse<{ signatureHtml: string }>;
      if (!payload?.success) throw new Error(payload?.error || "Failed to save signature");

      toast({
        title: "Firma guardada",
        description: "La firma global de developers se ha actualizado correctamente.",
      });
    } catch (error) {
      console.error("Failed to save signature:", error);
      toast({
        title: "Error",
        description: "No se pudo guardar la firma global.",
        variant: "destructive",
      });
    } finally {
      setSavingSignature(false);
    }
  };

  const sendMail = async () => {
    if (!validateFrom()) {
      toast({
        title: "Remitente inválido",
        description: "El remitente debe ser un correo válido terminado en @fqsource.com.",
        variant: "destructive",
      });
      return;
    }
    if (!subject.trim()) {
      toast({ title: "Falta asunto", description: "Introduce el asunto del correo.", variant: "destructive" });
      return;
    }
    if (!bodyHtml.trim()) {
      toast({ title: "Falta contenido", description: "Introduce el HTML del cuerpo.", variant: "destructive" });
      return;
    }

    const selectedUserIds = recipients.filter((r) => r.selected).map((r) => r.id);
    if (selectedUserIds.length === 0) {
      toast({
        title: "Sin destinatarios",
        description: "Selecciona al menos un miembro en copia oculta.",
        variant: "destructive",
      });
      return;
    }

    const missingBodyCids = getMissingCidRefs(bodyHtml, bodyAssets);
    const missingSignatureCids = getMissingCidRefs(signatureHtml, signatureAssets);
    const missingAll = [...missingBodyCids, ...missingSignatureCids];
    if (missingAll.length > 0) {
      toast({
        title: "Hay imágenes sin adjuntar",
        description: `CID sin asset: ${missingAll.slice(0, 2).join(", ")}${missingAll.length > 2 ? "..." : ""}`,
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("developer-mail-members", {
        body: {
          action: "send",
          fromEmail: resolvedFrom,
          subject: subject.trim(),
          bodyHtml,
          signatureHtml,
          bodyAssets,
          signatureAssets,
          selectedUserIds,
        },
      });

      if (error) throw error;
      const payload = data as DeveloperMailResponse<{ batchesSent: number; recipientsSent: number; historySaved?: boolean }>;
      if (!payload?.success) throw new Error(payload?.error || "Mail sending failed");

      toast({
        title: "Correo enviado",
        description: payload.data?.historySaved === false
          ? `Enviado a ${payload.data?.recipientsSent || selectedUserIds.length} miembros (sin guardar histórico).`
          : `Enviado correctamente a ${payload.data?.recipientsSent || selectedUserIds.length} miembros.`,
      });
      await fetchHistory("reset");
    } catch (error) {
      console.error("Failed to send mail:", error);
      toast({
        title: "Error enviando correo",
        description: "No se pudo completar el envío. Revisa los datos e inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const formatDateTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch (_err) {
      return iso;
    }
  };

  const getSenderLabel = (item: MailHistoryItem) => {
    const fullName = [item.sent_by_name, item.sent_by_surname].filter(Boolean).join(" ").trim();
    if (fullName && item.sent_by_email) return `${fullName} (${item.sent_by_email})`;
    if (fullName) return fullName;
    return item.sent_by_email || item.sent_by;
  };

  const openHistoryDetail = async (item: MailHistoryItem) => {
    setLoadingHistoryDetail(true);
    try {
      const { data, error } = await supabase
        .from("developer_mail_history")
        .select("id, created_at, sent_by, from_email, subject, body_html, signature_html, recipient_count, bcc_emails, inline_assets, batches_sent")
        .eq("id", item.id)
        .single();

      if (error) throw error;

      setViewingHistoryItem({
        ...(item as MailHistoryItem),
        ...(data as unknown as MailHistoryItem),
        bcc_emails: Array.isArray((data as any)?.bcc_emails) ? (data as any).bcc_emails : item.bcc_emails || [],
        inline_assets: parseInlineAssets((data as any)?.inline_assets),
      });
    } catch (error) {
      console.error("Failed to load history detail:", error);
      toast({
        title: "Error",
        description: "No se pudo cargar el detalle completo del correo.",
        variant: "destructive",
      });
      // fallback to current row to avoid blocking user
      setViewingHistoryItem(item);
    } finally {
      setLoadingHistoryDetail(false);
    }
  };

  const getHistoryHtml = (item: MailHistoryItem) => {
    const fullHtml = `${item.body_html || ""}${item.signature_html ? `<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;" />${item.signature_html}` : ""}`;
    const assets = parseInlineAssets(item.inline_assets);
    const byCid = new Map(assets.map((asset) => [normalizeCid(asset.cid), asset]));
    return fullHtml.replace(/src=(["'])cid:([^"']+)\1/gi, (full, quote, cid) => {
      const asset = byCid.get(normalizeCid(String(cid)));
      if (!asset) return full;
      return `src=${quote}data:${asset.mimeType};base64,${asset.base64Content}${quote}`;
    });
  };

  return (
    <div className="flex-1 bg-background min-h-screen overflow-auto">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-full">
              <Mail className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-foreground">Mail all members</h1>
              <p className="text-muted-foreground">
                Envío masivo para developers con HTML, preview y firma global.
              </p>
            </div>
          </div>

          {loadingPage ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">Cargando datos de correo...</CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <Card className="xl:col-span-2">
                <CardHeader>
                  <CardTitle>Contenido del correo</CardTitle>
                  <CardDescription>
                    El envío se hace a <strong>contact@fqsource.com</strong> y miembros en BCC.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Remitente</Label>
                      <Select value={senderPreset} onValueChange={(v) => setSenderPreset(v as SenderPreset)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona remitente" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="contact">{PRESET_SENDERS.contact}</SelectItem>
                          <SelectItem value="arturo">{PRESET_SENDERS.arturo}</SelectItem>
                          <SelectItem value="david">{PRESET_SENDERS.david}</SelectItem>
                          <SelectItem value="custom">Otro (@fqsource.com)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fromResolved">Remitente final</Label>
                      <Input
                        id="fromResolved"
                        value={resolvedFrom}
                        onChange={(e) => setCustomSender(e.target.value)}
                        readOnly={senderPreset !== "custom"}
                        placeholder="usuario@fqsource.com"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mailSubject">Asunto</Label>
                    <Input
                      id="mailSubject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Subject..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mailBody">HTML body</Label>
                    <Textarea
                      id="mailBody"
                      className="min-h-[220px] font-mono text-sm"
                      value={bodyHtml}
                      onChange={(e) => setBodyHtml(e.target.value)}
                      placeholder="<h1>...</h1>"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        id="body-image-upload"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        multiple
                        className="hidden"
                        onChange={(e) => handleImageUpload("body", e)}
                      />
                      <Button variant="outline" type="button" asChild>
                        <label htmlFor="body-image-upload" className="cursor-pointer">
                          <ImagePlus className="h-4 w-4 mr-2" />
                          Añadir imagen body
                        </label>
                      </Button>
                    </div>
                    {bodyAssets.length > 0 && (
                      <div className="rounded-md border p-2 space-y-2">
                        <p className="text-xs text-muted-foreground">Assets body ({bodyAssets.length})</p>
                        {bodyAssets.map((asset) => (
                          <div key={asset.cid} className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate">{asset.filename} · cid:{asset.cid}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              type="button"
                              onClick={() => removeAsset("body", asset.cid)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mailSignature">Firma global (HTML)</Label>
                    <Textarea
                      id="mailSignature"
                      className="min-h-[140px] font-mono text-sm"
                      value={signatureHtml}
                      onChange={(e) => setSignatureHtml(e.target.value)}
                      placeholder="<p>FQ Source Team</p>"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        id="signature-image-upload"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        multiple
                        className="hidden"
                        onChange={(e) => handleImageUpload("signature", e)}
                      />
                      <Button variant="outline" type="button" asChild>
                        <label htmlFor="signature-image-upload" className="cursor-pointer">
                          <ImagePlus className="h-4 w-4 mr-2" />
                          Añadir imagen firma
                        </label>
                      </Button>
                    </div>
                    {signatureAssets.length > 0 && (
                      <div className="rounded-md border p-2 space-y-2">
                        <p className="text-xs text-muted-foreground">Assets firma ({signatureAssets.length})</p>
                        {signatureAssets.map((asset) => (
                          <div key={asset.cid} className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate">{asset.filename} · cid:{asset.cid}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              type="button"
                              onClick={() => removeAsset("signature", asset.cid)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={saveSignature} disabled={savingSignature}>
                        <Save className="h-4 w-4 mr-2" />
                        {savingSignature ? "Guardando..." : "Guardar firma global"}
                      </Button>
                      <Button variant="outline" onClick={() => setPreviewOpen(true)}>
                        <Eye className="h-4 w-4 mr-2" />
                        Preview
                      </Button>
                      <Button onClick={sendMail} disabled={sending}>
                        <Send className="h-4 w-4 mr-2" />
                        {sending ? "Enviando..." : "Send"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Destinatarios BCC
                    </CardTitle>
                    <CardDescription>
                      {selectedCount} seleccionados de {recipients.length}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar email..."
                    />
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={selectAll}>
                        Select all
                      </Button>
                      <Button size="sm" variant="outline" onClick={deselectAll}>
                        Deselect all
                      </Button>
                    </div>
                    <ScrollArea className="h-[460px] rounded-md border p-3">
                      <div className="space-y-2">
                        {filteredRecipients.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No hay miembros para mostrar.</p>
                        ) : (
                          filteredRecipients.map((recipient) => (
                            <label key={recipient.id} className="flex items-center gap-2 text-sm cursor-pointer">
                              <Checkbox
                                checked={recipient.selected}
                                onCheckedChange={(checked) => toggleRecipient(recipient.id, checked === true)}
                              />
                              <span className="break-all">{recipient.email}</span>
                            </label>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <CardTitle>Histórico de envíos</CardTitle>
                      <CardDescription>
                        Últimos correos enviados por developers (quién, cuándo, asunto y destinatarios).
                      </CardDescription>
                    </div>
                    <Button variant="outline" onClick={() => fetchHistory("reset")} disabled={historyLoading}>
                      {historyLoading ? "Actualizando..." : "Actualizar"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {history.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Todavía no hay correos registrados.</p>
                  ) : (
                    <div className="space-y-3">
                      {history.map((item) => (
                        <div key={item.id} className="rounded-md border p-3 space-y-2">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-medium">{item.subject}</p>
                              <p className="text-xs text-muted-foreground">Enviado: {formatDateTime(item.created_at)}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-muted-foreground">
                                {item.recipient_count} destinatarios · {item.batches_sent} batch(es)
                              </p>
                              <Button size="sm" variant="outline" onClick={() => openHistoryDetail(item)}>
                                <Eye className="h-4 w-4 mr-1" />
                                View
                              </Button>
                            </div>
                          </div>
                          <p className="text-sm"><span className="font-medium">From:</span> {item.from_email}</p>
                          <p className="text-sm"><span className="font-medium">By:</span> {getSenderLabel(item)}</p>
                          {item.bcc_emails.length > 0 && (
                            <p className="text-xs text-muted-foreground break-all">
                              BCC: {item.bcc_emails.slice(0, 8).join(", ")}
                              {item.bcc_emails.length > 8 ? ` ... (+${item.bcc_emails.length - 8})` : ""}
                            </p>
                          )}
                        </div>
                      ))}
                      {historyHasMore && (
                        <div className="pt-1">
                          <Button
                            variant="outline"
                            onClick={() => fetchHistory("append")}
                            disabled={historyLoadingMore}
                            className="w-full"
                          >
                            {historyLoadingMore ? "Cargando..." : "Cargar más (20)"}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={!!viewingHistoryItem || loadingHistoryDetail}
        onOpenChange={() => {
          if (loadingHistoryDetail) return;
          setViewingHistoryItem(null);
        }}
      >
        <DialogContent className="max-w-6xl h-[90vh] !flex !flex-col">
          <DialogHeader>
            <DialogTitle>Email enviado</DialogTitle>
            <DialogDescription>Detalle completo del envío y previsualización del correo.</DialogDescription>
          </DialogHeader>
          {loadingHistoryDetail && (
            <div className="flex-1 min-h-0 flex items-center justify-center text-muted-foreground">Cargando detalle...</div>
          )}
          {viewingHistoryItem && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
              <div className="lg:col-span-1 rounded-md border p-3 space-y-2 overflow-y-auto">
                <p className="text-sm"><span className="font-medium">Asunto:</span> {viewingHistoryItem.subject}</p>
                <p className="text-sm"><span className="font-medium">Fecha:</span> {formatDateTime(viewingHistoryItem.created_at)}</p>
                <p className="text-sm"><span className="font-medium">By:</span> {getSenderLabel(viewingHistoryItem)}</p>
                <p className="text-sm"><span className="font-medium">From:</span> {viewingHistoryItem.from_email}</p>
                <p className="text-sm">
                  <span className="font-medium">Destinatarios:</span> {viewingHistoryItem.recipient_count} · {viewingHistoryItem.batches_sent} batch(es)
                </p>
                <div className="pt-2">
                  <p className="text-sm font-medium">BCC</p>
                  <p className="text-xs text-muted-foreground break-all">
                    {viewingHistoryItem.bcc_emails.length > 0 ? viewingHistoryItem.bcc_emails.join(", ") : "Sin destinatarios BCC"}
                  </p>
                </div>
              </div>
              <div className="lg:col-span-2 rounded-md border overflow-hidden min-h-0">
                <iframe
                  title="history-mail-preview"
                  className="w-full h-full bg-white"
                  srcDoc={getHistoryHtml(viewingHistoryItem)}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-5xl h-[85vh]">
          <DialogHeader>
            <DialogTitle>Email preview</DialogTitle>
            <DialogDescription>Vista previa del HTML final (body + firma).</DialogDescription>
          </DialogHeader>
          <div className="h-full min-h-0 rounded-md border overflow-hidden">
            <iframe title="mail-preview" className="w-full h-full bg-white" srcDoc={previewHtml} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DeveloperMailAllMembers;
