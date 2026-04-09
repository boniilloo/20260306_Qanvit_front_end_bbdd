import React, { useState, useEffect, useMemo } from 'react';
import { Users, ExternalLink, Briefcase, Star } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';

export interface LinkedInPerson {
  id: string;
  company_id: string;
  linkedin_profile_url: string | null;
  linkedin_profile_image_url: string | null;
  person_name: string;
  person_title: string | null;
  employee_count_linkedin: number | null;
  source_page: string | null;
  scraped_at: string;
}

interface LinkedInPeopleTabProps {
  companyId: string;
}

function isLinkedInMember(name: string | null): boolean {
  if (!name || !name.trim()) return true;
  const n = name.trim().toLowerCase();
  return n === 'linkedin member' || n === 'miembro de linkedin' || n.startsWith('linkedin member ·') || n.startsWith('miembro de linkedin ·');
}

const FEATURED_TITLE_PATTERNS: RegExp[] = [
  /\bdirector(a|es)?\b/i,
  /\bmanaging\s+director\b/i,
  /\bexecutive\s+director\b/i,
  /\bregional\s+director\b/i,
  /\bgeneral\s+manager\b/i,
  /\bgerente\s+general\b/i,
  /\bdirector\s+general\b/i,
  /\bdir(ector)?\.?\s*general\b/i,
  /\bconsejero\s+delegado\b/i,
  /\bconsejera\s+delegada\b/i,
  /\bC[- ]?EO\b/i,
  /\bC[- ]?FO\b/i,
  /\bC[- ]?TO\b/i,
  /\bC[- ]?OO\b/i,
  /\bC[- ]?MO\b/i,
  /\bC[- ]?IO\b/i,
  /\bC[- ]?RO\b/i,
  /\bC[- ]?DO\b/i,
  /\bC[- ]?PO\b/i,
  /\bchief\s+executive\b/i,
  /\bchief\s+financial\b/i,
  /\bchief\s+technology\b/i,
  /\bchief\s+operating\b/i,
  /\bchief\s+marketing\b/i,
  /\bchief\s+information\b/i,
  /\bchief\s+revenue\b/i,
  /\bchief\s+data\b/i,
  /\bchief\s+product\b/i,
  /\bchief\s+officer\b/i,
  /\bfounder\b/i,
  /\bfundador(a|es)?\b/i,
  /\bco[- ]?founder\b/i,
  /\bcofundador(a|es)?\b/i,
  /\bfounding\b/i,
  /\bCEO\b/i,
  /\bCFO\b/i,
  /\bCTO\b/i,
  /\bCOO\b/i,
  /\bCMO\b/i,
  /\bCIO\b/i,
  /\bCRO\b/i,
  /\bCDO\b/i,
  /\bCPO\b/i,
  /\bvice[- ]?president(e|a)?\b/i,
  /\bvicepresident(e|a)?\b/i,
  /\bVP\s+(of|de)\b/i,
];

function isFeaturedPerson(person: LinkedInPerson): boolean {
  const title = person.person_title ?? '';
  if (!title.trim()) return false;
  return FEATURED_TITLE_PATTERNS.some((re) => re.test(title));
}

function PersonCard({ person }: { person: LinkedInPerson }) {
  const [imageFailed, setImageFailed] = useState(false);
  const hasValidImage = !!person.linkedin_profile_image_url && !imageFailed;

  return (
    <div className="flex items-start gap-4 p-4 rounded-xl border border-gray-100 hover:border-[#f4a9aa]/40 hover:bg-gray-50/50 transition-colors">
      <div className="flex-shrink-0">
        {hasValidImage ? (
          <img
            src={person.linkedin_profile_image_url}
            alt={person.person_name}
            className="w-14 h-14 rounded-full object-cover bg-gray-100"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center">
            <Users className="w-7 h-7 text-gray-400" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {person.linkedin_profile_url ? (
            <a
              href={person.linkedin_profile_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-navy hover:text-[#f4a9aa] transition-colors truncate"
            >
              {person.person_name}
            </a>
          ) : (
            <span className="font-semibold text-navy truncate">{person.person_name}</span>
          )}
          {person.linkedin_profile_url && <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />}
        </div>
        {person.person_title && (
          <div className="flex items-start gap-1.5 mt-1 text-sm text-muted-foreground">
            <Briefcase className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span className="line-clamp-2">{person.person_title}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function LinkedInPeopleTab({ companyId }: LinkedInPeopleTabProps) {
  const [people, setPeople] = useState<LinkedInPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPeople = async () => {
      if (!companyId) return;
      setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await supabase
          .from('linkedin_company_people')
          .select('id, company_id, linkedin_profile_url, linkedin_profile_image_url, person_name, person_title, employee_count_linkedin, source_page, scraped_at')
          .eq('company_id', companyId)
          .order('person_name');

        if (err) {
          setError(err.message);
          setPeople([]);
          return;
        }
        setPeople((data ?? []) as LinkedInPerson[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load people');
        setPeople([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPeople();
  }, [companyId]);

  const { filtered, featured, other } = useMemo(() => {
    const filtered = people.filter((p) => !isLinkedInMember(p.person_name));
    const featured = filtered.filter(isFeaturedPerson);
    const other = filtered.filter((p) => !isFeaturedPerson(p));
    return { filtered, featured, other };
  }, [people]);

  if (loading) {
    return (
      <Card className="shadow-sm border-0 bg-white">
        <CardContent className="p-8">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="w-5 h-5 animate-pulse" />
            <span>Loading people from LinkedIn...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="shadow-sm border-0 bg-white">
        <CardContent className="p-8">
          <p className="text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (filtered.length === 0) {
    return (
      <Card className="shadow-sm border-0 bg-white">
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Users className="w-12 h-12 mb-4 opacity-50" />
            <p className="font-medium">No LinkedIn people data yet</p>
            <p className="text-sm mt-1">People linked to this company on LinkedIn will appear here once they have been synced.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const employeeCount = people[0]?.employee_count_linkedin ?? null;

  return (
    <Card className="shadow-sm border-0 bg-white">
      <CardContent className="p-8">
        <div className="flex items-center gap-2 mb-6">
          <Users className="w-5 h-5 text-navy" />
          <h2 className="text-lg font-semibold text-navy">People on LinkedIn</h2>
        </div>
        {employeeCount != null && (
          <p className="text-sm text-muted-foreground mb-6">
            {employeeCount.toLocaleString()} employees on LinkedIn · Last synced from company page
          </p>
        )}

        {featured.length > 0 && (
          <div className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <Star className="w-5 h-5 text-amber-500" />
              <h3 className="text-base font-semibold text-navy">Personas destacadas</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Directores, C-level (CEO, CFO, CTO, etc.) y fundadores
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {featured.map(function (person) {
                return <PersonCard key={person.id} person={person} />;
              })}
            </div>
          </div>
        )}

        {other.length > 0 && (
          <div>
            <h3 className="text-base font-semibold text-navy mb-4">
              {featured.length > 0 ? 'Resto del equipo' : 'Equipo'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {other.map(function (person) {
                return <PersonCard key={person.id} person={person} />;
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
