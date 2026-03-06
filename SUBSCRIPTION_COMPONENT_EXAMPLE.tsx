// Example React Component for Subscription Management
// Place this in: src/components/subscription/SubscriptionManager.tsx

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';

interface SubscriptionInfo {
  status: string;
  subscription_status: string;
  current_period_end: string | null;
  current_period_start: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  stripe_subscription?: {
    id: string;
    status: string;
    current_period_end: string;
    cancel_at_period_end: boolean;
    items: Array<{
      price_id: string;
      amount: number;
      currency: string;
      interval: string;
    }>;
  };
  payment_method?: {
    type: string;
    card: {
      brand: string;
      last4: string;
      exp_month: number;
      exp_year: number;
    };
  };
  payment_failures?: Array<{
    amount: number;
    failure_message: string;
    next_payment_attempt: string | null;
  }>;
}

export function SubscriptionManager() {
  const { user, company } = useAuth();
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && company) {
      loadSubscriptionInfo();
    }
  }, [user, company]);

  const loadSubscriptionInfo = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: funcError } = await supabase.functions.invoke('manage-subscription', {
        body: {
          action: 'get_info',
          userId: user.id,
          companyId: company.id,
        }
      });

      if (funcError) throw funcError;
      if (data.error) throw new Error(data.error);

      setSubscriptionInfo(data);
    } catch (err: any) {
      console.error('Error loading subscription:', err);
      setError(err.message || 'Failed to load subscription information');
    } finally {
      setLoading(false);
    }
  };

  const openBillingPortal = async () => {
    try {
      const { data, error: funcError } = await supabase.functions.invoke('manage-subscription', {
        body: {
          action: 'open_billing_portal',
          userId: user.id,
          companyId: company.id,
        }
      });

      if (funcError) throw funcError;
      if (data.error) throw new Error(data.error);

      // Redirect to Stripe Billing Portal
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      console.error('Error opening billing portal:', err);
      alert('Failed to open billing portal. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-600">Loading subscription information...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-600">{error}</p>
        <button
          onClick={loadSubscriptionInfo}
          className="mt-2 text-sm text-red-600 underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!subscriptionInfo) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">No Active Subscription</h3>
        <p className="text-gray-600 mb-4">
          You don't have an active subscription yet.
        </p>
        <button
          onClick={() => window.location.href = '/subscription/create'}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Subscribe Now
        </button>
      </div>
    );
  }

  const subscription = subscriptionInfo.stripe_subscription;
  const isActive = subscriptionInfo.subscription_status === 'active';
  const isPastDue = subscriptionInfo.subscription_status === 'past_due';
  const isCanceled = subscriptionInfo.subscription_status === 'canceled';
  const willCancel = subscriptionInfo.cancel_at_period_end;

  // Format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Format price
  const formatPrice = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      {isPastDue && subscriptionInfo.payment_failures && subscriptionInfo.payment_failures.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h4 className="text-red-800 font-semibold mb-2">Payment Failed</h4>
          <p className="text-red-700 text-sm mb-3">
            {subscriptionInfo.payment_failures[0].failure_message}
          </p>
          <button
            onClick={openBillingPortal}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
          >
            Update Payment Method
          </button>
        </div>
      )}

      {willCancel && !isCanceled && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800">
            Your subscription will be canceled on <strong>{formatDate(subscriptionInfo.current_period_end)}</strong>
          </p>
          <button
            onClick={openBillingPortal}
            className="mt-2 text-sm text-yellow-800 underline"
          >
            Reactivate subscription
          </button>
        </div>
      )}

      {/* Subscription Card */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Subscription</h2>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                isActive ? 'bg-green-100 text-green-800' :
                isPastDue ? 'bg-red-100 text-red-800' :
                isCanceled ? 'bg-gray-100 text-gray-800' :
                'bg-yellow-100 text-yellow-800'
              }`}>
                {subscriptionInfo.subscription_status?.toUpperCase() || 'UNKNOWN'}
              </span>
            </div>
          </div>
          <button
            onClick={openBillingPortal}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
          >
            Manage Subscription
          </button>
        </div>

        {/* Subscription Details */}
        {subscription && (
          <div className="space-y-4">
            {/* Price */}
            <div className="border-t pt-4">
              <div className="text-sm text-gray-600 mb-1">Current Plan</div>
              {subscription.items.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center">
                  <div>
                    <div className="text-2xl font-bold text-gray-900">
                      {formatPrice(item.amount, item.currency)}
                    </div>
                    <div className="text-sm text-gray-600">
                      per {item.interval}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Next Billing Date */}
            {!isCanceled && subscriptionInfo.current_period_end && (
              <div className="border-t pt-4">
                <div className="text-sm text-gray-600 mb-1">
                  {willCancel ? 'Subscription ends' : 'Next billing date'}
                </div>
                <div className="text-lg font-semibold text-gray-900">
                  {formatDate(subscriptionInfo.current_period_end)}
                </div>
              </div>
            )}

            {/* Payment Method */}
            {subscriptionInfo.payment_method && (
              <div className="border-t pt-4">
                <div className="text-sm text-gray-600 mb-2">Payment Method</div>
                <div className="flex items-center gap-2">
                  <div className="text-gray-900 capitalize">
                    {subscriptionInfo.payment_method.card.brand}
                  </div>
                  <span className="text-gray-400">••••</span>
                  <div className="text-gray-900">
                    {subscriptionInfo.payment_method.card.last4}
                  </div>
                  <span className="text-gray-500 text-sm">
                    Exp: {subscriptionInfo.payment_method.card.exp_month}/{subscriptionInfo.payment_method.card.exp_year}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions Info */}
        <div className="mt-6 pt-6 border-t">
          <p className="text-sm text-gray-600">
            Click "Manage Subscription" to:
          </p>
          <ul className="mt-2 space-y-1 text-sm text-gray-600">
            <li>• Update payment method</li>
            <li>• Cancel subscription</li>
            <li>• View billing history</li>
            <li>• Download invoices</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

