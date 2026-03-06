import React from 'react';
import { Mail, Phone } from 'lucide-react';

interface ContactData {
  contact_emails?: any;
  contact_phones?: any;
}

interface Props {
  data: ContactData;
}

const CompanyOverviewRightContact: React.FC<Props> = ({ data }) => {
  const [showAllEmails, setShowAllEmails] = React.useState(false);
  const [showAllPhones, setShowAllPhones] = React.useState(false);

  const toArray = (value: any) => {
    if (!value) return [] as string[];
    if (typeof value === 'string') {
      try {
        return value.startsWith('[') ? JSON.parse(value) : [value];
      } catch {
        return [value];
      }
    }
    return Array.isArray(value) ? value : [];
  };

  const emails = toArray(data.contact_emails);
  const phones = toArray(data.contact_phones);
  const visibleEmails = showAllEmails ? emails : emails.slice(0, 2);
  const visiblePhones = showAllPhones ? phones : phones.slice(0, 2);
  const hiddenEmailsCount = Math.max(0, emails.length - visibleEmails.length);
  const hiddenPhonesCount = Math.max(0, phones.length - visiblePhones.length);

  React.useEffect(() => {
    setShowAllEmails(false);
    setShowAllPhones(false);
  }, [data.contact_emails, data.contact_phones]);

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <h3 className="font-semibold text-navy mb-3">Contact Information</h3>

      {/* Email */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Mail className="w-4 h-4 text-navy" />
          <span className="font-medium text-sm text-navy">Email</span>
        </div>
        <div className="ml-6">
          {emails.length > 0 ? (
            <>
              {visibleEmails.map((email, index) => (
                <div key={index} className="text-sm text-charcoal mb-1">{String(email)}</div>
              ))}
              {hiddenEmailsCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllEmails(true)}
                  className="text-sm text-sky hover:underline font-medium"
                >
                  {hiddenEmailsCount} more
                </button>
              )}
            </>
          ) : (
            <span className="text-sm text-gray-500">Info not provided yet</span>
          )}
        </div>
      </div>

      {/* Phone */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Phone className="w-4 h-4 text-navy" />
          <span className="font-medium text-sm text-navy">Telephone</span>
        </div>
        <div className="ml-6">
          {phones.length > 0 ? (
            <>
              {visiblePhones.map((phone, index) => (
                <div key={index} className="text-sm text-charcoal mb-1">{String(phone)}</div>
              ))}
              {hiddenPhonesCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllPhones(true)}
                  className="text-sm text-sky hover:underline font-medium"
                >
                  {hiddenPhonesCount} more
                </button>
              )}
            </>
          ) : (
            <span className="text-sm text-gray-500">Info not provided yet</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default CompanyOverviewRightContact;


