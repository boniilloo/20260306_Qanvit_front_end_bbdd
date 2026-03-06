import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Joyride, { CallBackProps, STATUS, Step, Styles, ACTIONS } from 'react-joyride';
import { supabase } from '@/integrations/supabase/client';

interface OnboardingTourProps {
  isOpen: boolean;
  userId?: string | null;
  onComplete: () => void;
}

const OnboardingTour: React.FC<OnboardingTourProps> = ({ isOpen, userId, onComplete }) => {
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const modalCheckIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  const DEFAULT_PUBLIC_RFX_EXAMPLE_ID = 'eac78558-4c3e-4d05-847e-a954c469868a';
  const isChatExampleRoute = location.pathname.startsWith('/chat-example/');

  useEffect(() => {
    if (isOpen) {
      // Reset state when opening the onboarding
      setStepIndex(0);
      setRun(false);
      
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        setRun(true);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      // Reset state when closing the onboarding
      setRun(false);
      setStepIndex(0);
    }
  }, [isOpen]);




  // Cleanup modal check interval on unmount
  useEffect(() => {
    return () => {
      if (modalCheckIntervalRef.current) {
        clearInterval(modalCheckIntervalRef.current);
        modalCheckIntervalRef.current = null;
      }
    };
  }, []);






  // Define the tour steps
  // If the user starts onboarding from a public chat example route, keep only step 1 and step 8.
  // This prevents a long sequence of irrelevant steps on `/chat-example/:id` while still allowing
  // onboarding to progress to the public RFX example.
  const steps: Step[] = isChatExampleRoute ? [
    {
      target: 'body',
      content: (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-lg">1</span>
            <h2 className="text-2xl font-bold" style={{ color: '#1A1F2C' }}>
              Welcome to FQ Source! 🎉
            </h2>
          </div>
          <p className="text-base">
            FQ Source helps <strong>buyers</strong> find the best specialized suppliers in specific industry verticals (currently open Machine Vision, more coming soon).
          </p>
          <p className="text-base">
            At the same time, we help <strong>suppliers</strong> to get discovered in a simple and intuitive way.
          </p>
        </div>
      ),
      placement: 'center',
      disableBeacon: true,
    },
    {
      target: 'body',
      content: (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-lg">8</span>
            <h3 className="text-2xl font-bold" style={{ color: '#1A1F2C' }}>
              Explore an RFX example 🚀
            </h3>
          </div>
          <p className="text-base">
            Next, we&apos;ll jump to a <strong>public RFX example</strong> so you can see how specs, candidates and sending work end-to-end.
          </p>
        </div>
      ),
      placement: 'center',
      disableBeacon: true,
    },
  ] : [
    {
      target: 'body',
      content: (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-lg">1</span>
            <h2 className="text-2xl font-bold" style={{ color: '#1A1F2C' }}>
              Welcome to FQ Source! 🎉
            </h2>
          </div>
          <p className="text-base">
            FQ Source helps <strong>buyers</strong> find the best specialized suppliers in specific industry verticals (currently open Machine Vision, more coming soon).
          </p>
          <p className="text-base">
            At the same time, we help <strong>suppliers</strong> to get discovered in a simple and intuitive way.
          </p>
          <div className="mt-4 space-y-3">
            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="font-semibold text-sm" style={{ color: '#1A1F2C' }}>🔍 Discovery Agent</p>
              <p className="text-sm text-gray-700">Quick preliminary search to find potential suppliers</p>
            </div>
            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="font-semibold text-sm" style={{ color: '#1A1F2C' }}>📋 RFX Agent</p>
              <p className="text-sm text-gray-700">Launch RFQs, RFPs, and RFIs to formalize your requirements</p>
            </div>
          </div>
        </div>
      ),
      placement: 'center',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding-target="define-rfx-specifications-item"]',
      content: (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-lg">2</span>
            <h3 className="text-xl font-bold" style={{ color: '#1A1F2C' }}>
              RFX Progress - Define Specifications 📋
            </h3>
          </div>
          <p className="text-base">
            This is <strong>"Define RFX Specifications"</strong> in the RFX Progress section. This is the first step in creating an RFX, where you'll define your project scope, technical requirements, and company requirements.
          </p>
          <p className="text-base">
            When you click on this item, you can see the details and progress of this step on the right side.
          </p>
        </div>
      ),
      placement: 'left',
      spotlightClicks: false,
      hideNextButton: false,
    },
    {
      target: 'button[data-onboarding-target="go-to-rfx-specs-button"]',
      content: (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-lg">3</span>
            <h3 className="text-xl font-bold" style={{ color: '#1A1F2C' }}>
              Go to RFX Specs 📝
            </h3>
          </div>
          <p className="text-base">
            Let's click the <strong>"Go to RFX Specs"</strong> button and start the process!
          </p>
          <p className="text-base">
            This is where you'll define all your RFX requirements in detail.
          </p>
        </div>
      ),
      placement: 'top',
      spotlightClicks: false,
      hideNextButton: false,
    },
    {
      // Step 11: Full chat sidebar (right side)
      target: '[data-rfx-chat-sidebar="true"]',
      content: (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-lg">4</span>
            <h3 className="text-xl font-bold" style={{ color: '#1A1F2C' }}>
              RFX Agent Chat Sidebar 💬
            </h3>
          </div>
          <p className="text-base">
            On this <strong>right-hand chat sidebar</strong> you are seeing the full conversation with the <strong>RFX Agent</strong>.
          </p>
          <p className="text-base">
            In this example RFX, the buyer simply <strong>talked to the agent</strong>, and based on that dialogue the assistant
            automatically <strong>filled in all the specification sections</strong> of the project.
          </p>
          <p className="text-sm text-gray-600 mt-2">
            You can continue the conversation here at any time to refine, adjust or extend any part of the RFX without manually editing fields.
          </p>
        </div>
      ),
      placement: 'left',
      disableBeacon: true,
    },
    {
      // Step 12: Specs sections (collapsible blocks)
      target: '[data-onboarding-target="rfx-specs-fields"]',
      content: (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-lg">5</span>
            <h3 className="text-xl font-bold" style={{ color: '#1A1F2C' }}>
              Editable RFX Specification Sections 📋
            </h3>
          </div>
          <p className="text-base">
            These are the <strong>collapsible sections</strong> of the RFX where you can review and fine-tune what the agent generated:
          </p>
          <ul className="list-disc list-outside ml-6 space-y-1 text-sm">
            <li><strong>Project Description:</strong> context and objectives of the use case</li>
            <li><strong>Technical Specifications:</strong> functional and technical criteria the solution must meet</li>
            <li><strong>Company Requirements:</strong> what type of supplier you&apos;re looking for (industry, size, certifications, etc.)</li>
            <li><strong>Project Timeline:</strong> milestones, target dates and key deadlines</li>
          </ul>
          <p className="text-sm text-gray-600 mt-2">
            You can collapse/expand each block, edit the content manually, or ask the agent (via the chat sidebar) to propose structured changes to any of these sections.
          </p>
        </div>
      ),
      placement: 'left',
      disableBeacon: true,
    },
    {
      // Step 13: Download PDF explanation (shown as centered modal)
      // Uses body as target to avoid issues if the actual button is not yet available in the DOM
      target: 'body',
      content: (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-lg">6</span>
            <h3 className="text-xl font-bold" style={{ color: '#1A1F2C' }}>
              Additional functionalities 📄
            </h3>
          </div>
          <p className="text-base">
            At the top of this page, the <strong>"Generate PDF"</strong> button lets you download your complete RFX specifications as a professional PDF document, even customized with your company branding.
          </p>
          <p className="text-base">
            You can also <strong>version</strong> the RFX specs content for future revision.
          </p>
          <p className="text-sm text-gray-600 mt-2">
            Feel free to try everything once the onboarding finishes!
          </p>
        </div>
      ),
      placement: 'center',
      disableBeacon: true,
    },
    {
      // Step 14: Ask FQ Agent button in candidates page
      target: 'button[data-onboarding-target="ask-fq-agent-button"]',
      content: (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-lg">7</span>
            <h3 className="text-xl font-bold" style={{ color: '#1A1F2C' }}>
              Candidates Section - Ask FQ Agent for Recommendations 🤖
            </h3>
          </div>
          <p className="text-base">
            This <strong>"Ask FQ Agent"</strong> button connects your RFX specifications with FQ database using AI so that you get generate a curated list of recommended candidates.
          </p>
          <p className="text-base">
            The agent uses your <strong>project description</strong>, <strong>technical requirements</strong> and <strong>company requirements</strong> to find the best matches in the database.
          </p>
          <p className="text-sm text-gray-600 mt-2">
            You can click it whenever you want to (re)generate recommendations as your specs evolve.
          </p>
        </div>
      ),
      placement: 'bottom',
      disableBeacon: true,
      spotlightClicks: false,
    },
    {
      // Step 15: FQ recommended candidates list (non-interactive view)
      target: 'body',
      content: (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-lg">8</span>
            <h3 className="text-xl font-bold" style={{ color: '#1A1F2C' }}>
              Review the Recommended Candidates 🎯
            </h3>
          </div>
          <p className="text-base">
            Below you can see the <strong>list of candidates recommended by FQ</strong>, ordered by their overall match with your RFX.
          </p>
          <p className="text-base">
            Each card shows <strong>overall, technical and company match scores</strong>, so you can quickly understand why they are a good fit.
          </p>
        </div>
      ),
      placement: 'center',
      disableBeacon: true,
    },
    {
      // Step 16: Manual selection tab / area (in candidates page)
      target: 'body',
      content: (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-lg">9</span>
            <h3 className="text-xl font-bold" style={{ color: '#1A1F2C' }}>
              Manual Selection of Candidates 🧭
            </h3>
          </div>
          <p className="text-base">
            In the <strong>Manual selection</strong> tab, you can <strong>search and add companies or products manually</strong> to include them in this RFX.
          </p>
          <p className="text-base">
            This is ideal when you already know specific suppliers you want to invite, in addition to those recommended by the agent.
          </p>
          <p className="text-sm text-gray-600 mt-2">
            Use both the recommended list and manual selection to build the strongest possible candidate set.
          </p>
        </div>
      ),
      placement: 'center',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding-target="nda-section"]',
      content: (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-lg">10</span>
            <h3 className="text-xl font-bold" style={{ color: '#1A1F2C' }}>
              Launching - Protect your RFX with an NDA 🔒
            </h3>
          </div>
          <p className="text-base">
            You can upload an <strong>NDA (Non-Disclosure Agreement)</strong> that suppliers must sign before accessing your RFX details.
          </p>          
          <p className="text-base">
            Suppliers will not be able to review the RFX untill NDA is signed and validated by FQ experts.
          </p>
          <p className="text-sm text-gray-600 mt-2">
            This ensures your sensitive information remains confidential throughout the sourcing process.
          </p>
        </div>
      ),
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding-target="send-rfx-section"]',
      content: (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-lg">11</span>
            <h3 className="text-xl font-bold" style={{ color: '#1A1F2C' }}>
              Validate & Send 🚀
            </h3>
          </div>
          <p className="text-base">
            Before sending the RFX to suppliers, <strong>all RFX members must validate</strong> the specifications and candidate selection.
          </p>
          <p className="text-base">
            Once everyone has approved, the "Send to Suppliers" button will become active.
          </p>
        </div>
      ),
      placement: 'top',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding-target="rfx-progress-item-fq_validation"]',
      content: (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-lg">12</span>
            <h3 className="text-xl font-bold" style={{ color: '#1A1F2C' }}>
              FQ Source Validation 🛡️
            </h3>
          </div>
          <p className="text-base">
            Once sent, all RFXs are <strong>validated by the FQ Source team</strong>.
          </p>
          <p className="text-base">
            We ensure every RFX reaching suppliers is verified and backed by real intent, maintaining a high-quality marketplace.
          </p>
        </div>
      ),
      placement: 'left',
      disableBeacon: true,
    },
    {
      target: '[data-onboarding-target="rfx-progress-item-responses"]',
      content: (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-lg">13</span>
            <h3 className="text-xl font-bold" style={{ color: '#1A1F2C' }}>
              Responses & AI Analysis 📊
            </h3>
          </div>
          <p className="text-base">
            This is where you'll review supplier proposals.
          </p>
          <p className="text-base">
            You can analyze them yourself, or use our <strong>AI Agent</strong> to compare responses, highlight key differences, iterate with suppliers and score them against your requirements (AI features under development).
          </p>
        </div>
      ),
      placement: 'left',
      disableBeacon: true,
    },
    {
      target: 'body',
      content: (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-lg">14</span>
            <h3 className="text-xl font-bold" style={{ color: '#1A1F2C' }}>
              Supplier Database 🌍
            </h3>
          </div>
          <p className="text-base">
            We rely our information on a <strong>propietary database</strong>, where suppliers also verify and complete their information.
          </p>
          <p className="text-base">
            Our proprietary database is constantly updated with new suppliers verifying their information, so you can always find new partners.
          </p>
        </div>
      ),
      placement: 'center',
      disableBeacon: true,
    },
    {
      target: 'body',
      content: (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-lg">15</span>
            <h3 className="text-2xl font-bold" style={{ color: '#1A1F2C' }}>
              You're All Set! 🚀
            </h3>
          </div>
          <p className="text-base">
            The initial tutorial is complete.
          </p>
          <p className="text-base">
            You are now free to explore the platform, create your own RFXs, and discover new suppliers.
          </p>
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-gray-700 font-medium text-center">
              <strong>Welcome to the future of industrial sourcing with FQ Source.</strong>
            </p>
          </div>
        </div>
      ),
      placement: 'center',
      disableBeacon: true,
    },
  ];

  // Custom styles matching your color scheme
  // Dynamic styles based on current step - first step is wider
  const isFirstStep = stepIndex === 0;
  const customStyles: Styles = {
    options: {
      primaryColor: '#80c8f0', // azul claro
      textColor: '#1A1F2C', // azul oscuro
      backgroundColor: '#ffffff',
      arrowColor: '#ffffff',
      overlayColor: 'rgba(26, 31, 44, 0.5)', // More transparent to let modal stand out
      zIndex: 10050, // Lower than modal overlay
    },
    tooltip: {
      borderRadius: 8,
      padding: 24,
      zIndex: 10080, // Higher than modal content (10070)
      maxWidth: isFirstStep ? '700px' : '500px', // Wider for first step
      width: isFirstStep ? '90%' : 'auto',
    },
    tooltipContent: {
      padding: '12px 0',
    },
    buttonNext: {
      backgroundColor: '#80c8f0',
      color: '#1A1F2C',
      borderRadius: 6,
      padding: '10px 20px',
      fontSize: '14px',
      fontWeight: 600,
      zIndex: 10090, // Even higher to ensure clickability
      position: 'relative',
    },
    buttonBack: {
      color: '#1A1F2C',
      marginRight: 10,
    },
    buttonClose: {
      display: 'none', // Hide close button to force completion
    },
    buttonSkip: {
      color: '#6b7280',
    },
  };

  const handleJoyrideCallback = async (data: CallBackProps) => {
    const { status, action, index, type, step } = data;
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];

    // Minimal flow when onboarding is started from `/chat-example/:id`:
    // keep only step 1 and step 8, and on completion redirect to the RFX example.
    if (isChatExampleRoute) {
      if (type === 'step:after' && (action === ACTIONS.NEXT || action === ACTIONS.PREV)) {
        if (action === ACTIONS.NEXT) {
          setStepIndex(Math.min(index + 1, steps.length - 1));
        } else if (action === ACTIONS.PREV) {
          setStepIndex(Math.max(index - 1, 0));
        }
      }

      if (finishedStatuses.includes(status)) {
        // Redirect to the public RFX example once the short onboarding finishes.
        // Do this before calling onComplete so the user lands in the right place.
        navigate(`/rfx-example/${DEFAULT_PUBLIC_RFX_EXAMPLE_ID}`, { replace: true });

        setRun(false);
        setStepIndex(0);

        // Mark onboarding as completed (same as default behavior)
        if (userId) {
          try {
            const { error } = await supabase
              .from('app_user')
              .update({ onboarding_completed: true })
              .eq('auth_user_id', userId);

            if (error) {
              console.error('Error marking onboarding as completed:', error);
            }
          } catch (error) {
            console.error('Error updating onboarding status:', error);
          }
        } else {
          localStorage.setItem('fq_onboarding_completed', 'true');
        }

        onComplete();
      }

      return;
    }

    // Handle target not found errors - skip to next step
    if (type === 'error:target_not_found') {
      setStepIndex(index + 1);
      return;
    }

    // Update step index for normal navigation (back/next)
    if (type === 'step:after' && (action === ACTIONS.NEXT || action === ACTIONS.PREV)) {
      if (action === ACTIONS.NEXT) {
        // Special case: Navigate to RFX example when moving from step 0 to step 1
        if (index === 0) {
          setRun(false);
          navigate('/rfx-example/eac78558-4c3e-4d05-847e-a954c469868a');

          // Wait for item to be available, with retries
          const findItem = (retries = 20): void => {
            const targetItem = document.querySelector('[data-onboarding-target="define-rfx-specifications-item"]') as HTMLElement;
            
            if (targetItem) {
              targetItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setTimeout(() => {
                setStepIndex(1);
                setRun(true);
              }, 500);
            } else if (retries > 0) {
              setTimeout(() => findItem(retries - 1), 300);
            } else {
              setStepIndex(1);
              setRun(true);
            }
          };
          
          setTimeout(() => findItem(), 800);
          return;
        }


        // Special case: When user clicks "next" on step 9 (index 1), select the Define RFX Specifications item and advance to step 10
        if (index === 1 && action === ACTIONS.NEXT) {
          // Dispatch custom event to select the item
          const selectEvent = new CustomEvent('onboarding-select-item', { detail: { itemId: 'specs' } });
          window.dispatchEvent(selectEvent);
          
          // Wait for the selection to take effect and for the button to appear, then advance
          setRun(false);
          const findButton = (retries = 15): void => {
            const targetButton = document.querySelector('button[data-onboarding-target="go-to-rfx-specs-button"]') as HTMLElement;
            
            if (targetButton) {
              targetButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setTimeout(() => {
                setStepIndex(2);
                setRun(true);
              }, 500);
            } else if (retries > 0) {
              setTimeout(() => findButton(retries - 1), 200);
            } else {
              setStepIndex(2);
              setRun(true);
            }
          };
          
          // Start looking for the button after a short delay to allow the selection to take effect
          setTimeout(() => findButton(), 300);
          return;
        }

        // Special case: When user clicks "next" on step 10 (index 2), navigate to specs page
        if (index === 2 && action === ACTIONS.NEXT) {
          // Get the RFX ID from the current URL
          const currentPath = window.location.pathname;
          const rfxIdMatch = currentPath.match(/\/rfx-example\/([^/]+)/);
          if (rfxIdMatch) {
            const rfxId = rfxIdMatch[1];
            setRun(false);
            navigate(`/rfx-example/specs/${rfxId}`);
            // Wait for page to load, then continue to step 11 (specs fields)
            setTimeout(() => {
              // Find the specs fields element and show step 11
              const findElement = (retries = 15): void => {
                const targetElement = document.querySelector('[data-onboarding-target="rfx-specs-fields"]') as HTMLElement;
                
                if (targetElement) {
                  targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  setTimeout(() => {
                    // Step 11 is index 3 (0-based)
                    setStepIndex(3);
                    setRun(true);
                  }, 500);
                } else if (retries > 0) {
                  setTimeout(() => findElement(retries - 1), 300);
                } else {
                  // Even if not found, go to visual step 11 (index 3)
                  setStepIndex(3);
                  setRun(true);
                }
              };
              
              // Start looking for the element
              findElement();
            }, 1500);
          } else {
            // If we can't find the RFX ID, just advance to step 11 (index 3)
            setStepIndex(3);
            setRun(true);
          }
          return;
        }

        // Special case: When moving from step 11 (chat sidebar, index 3) to step 12 (specs sections),
        // collapse main specs accordions and ensure the fields are centered
        if (index === 3) {
          // Notify specs component to collapse main sections
          window.dispatchEvent(new CustomEvent('onboarding-collapse-main-specs'));
          setRun(false);

          const findElement = (retries = 10): void => {
            const targetElement = document.querySelector('[data-onboarding-target="rfx-specs-fields"]') as HTMLElement;

            if (targetElement) {
              targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setTimeout(() => {
                setStepIndex(4);
                setRun(true);
              }, 500);
            } else if (retries > 0) {
              setTimeout(() => findElement(retries - 1), 300);
            } else {
              setStepIndex(4);
              setRun(true);
            }
          };

          setTimeout(() => findElement(), 300);
          return;
        }

        // Special case: When moving from step 12 (index 4) to step 13 (PDF explanation),
        // just advance normally (centered modal over specs page)
        if (index === 4) {
          setStepIndex(5); // visual step 13
          return;
        }

        // Special case: After step 13 (index 5 - PDF explanation on specs),
        // navigate to candidates page and show step 14 there (Ask FQ Agent button)
        if (index === 5) {
          setRun(false);

          // Get the RFX ID from the current URL (we are on /rfx-example/specs/:id)
          const currentPath = window.location.pathname;
          const rfxIdMatch = currentPath.match(/\/rfx-example\/specs\/([^/]+)/) || currentPath.match(/\/rfx-example\/([^/]+)/);

          if (rfxIdMatch) {
            const rfxId = rfxIdMatch[1];
            navigate(`/rfx-example/candidates/${rfxId}`);

          // Wait for candidates page to load and the Ask FQ Agent button to be available,
          // then show step 14 (index 6) pointing to that button
          const waitForAskAgentButton = (retries = 20): void => {
            const askAgentButton = document.querySelector('button[data-onboarding-target="ask-fq-agent-button"]') as HTMLElement | null;

            if (askAgentButton) {
              askAgentButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setTimeout(() => {
                setStepIndex(6);
                setRun(true);
              }, 500);
            } else if (retries > 0) {
              setTimeout(() => waitForAskAgentButton(retries - 1), 300);
            } else {
              // If we can't find the button, skip step 14 and move to step 15 (index 7, body-centered)
              setStepIndex(7);
              setRun(true);
            }
          };

          // Give the route a moment to render before starting to look for the button
          setTimeout(() => {
            waitForAskAgentButton();
          }, 800);
          } else {
            setStepIndex(6);
            setRun(true);
          }
          return;
        }

        // Special case: Before moving from step 15 (index 7) to step 16 (manual selection),
        // automatically switch to the Manual selection tab
        if (index === 7) {
          // Notify candidates page (in case it wants to react explicitly)
          window.dispatchEvent(new Event('onboarding-switch-to-manual-tab'));

          // Try to click the Manual selection tab directly, with a few retries in case of re-renders
          const selectManualTab = (retries = 10): void => {
            const manualTab = document.querySelector('[data-onboarding-target="candidates-tab-manual"]') as HTMLElement | null;
            if (manualTab) {
              manualTab.click();
            } else if (retries > 0) {
              setTimeout(() => selectManualTab(retries - 1), 200);
            }
          };

          // Small delay to let Joyride update and then switch the tab
          setTimeout(() => {
            selectManualTab();
            setStepIndex(8); // visual step 16
          }, 300);

          return;
        }

        // Special case: When moving from step 16 (index 8) to step 17 (NDA on sending page),
        // navigate to sending page
        if (index === 8) {
          setRun(false);
          
          // Get the RFX ID from the current URL
          const currentPath = window.location.pathname;
          const rfxIdMatch = currentPath.match(/\/rfx-example\/candidates\/([^/]+)/) || currentPath.match(/\/rfx-example\/([^/]+)/);
          
          if (rfxIdMatch) {
            const rfxId = rfxIdMatch[1];
            navigate(`/rfx-example/sending/${rfxId}`);
            
            // Wait for sending page to load and find NDA section
            const waitForNdaSection = (retries = 20): void => {
              const ndaSection = document.querySelector('[data-onboarding-target="nda-section"]') as HTMLElement | null;

              if (ndaSection) {
                // Dispatch event to expand NDA section
                window.dispatchEvent(new CustomEvent('onboarding-expand-nda-section'));
                
                // Wait a bit for the expansion animation to complete
                setTimeout(() => {
                  ndaSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  setTimeout(() => {
                    setStepIndex(9);
                    setRun(true);
                  }, 500);
                }, 300);
              } else if (retries > 0) {
                setTimeout(() => waitForNdaSection(retries - 1), 300);
              } else {
                setStepIndex(9);
                setRun(true);
              }
            };

            setTimeout(() => {
              waitForNdaSection();
            }, 1000);
          } else {
            setStepIndex(9);
            setRun(true);
          }
          return;
        }

        // Special case: When moving from step 17 (index 9) to step 18 (Send RFX section),
        // need to expand the send RFX section first before advancing
        if (index === 9) {
          // Dispatch event to expand Send RFX section
          window.dispatchEvent(new CustomEvent('onboarding-expand-send-section'));
          
          setRun(false);
          
          // Wait for the section to expand and then find the element
          const waitForSendSection = (retries = 20): void => {
            const sendSection = document.querySelector('[data-onboarding-target="send-rfx-section"]') as HTMLElement | null;

            if (sendSection) {
              sendSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setTimeout(() => {
                setStepIndex(10);
                setRun(true);
              }, 500);
            } else if (retries > 0) {
              setTimeout(() => waitForSendSection(retries - 1), 300);
            } else {
              setStepIndex(10);
              setRun(true);
            }
          };

          setTimeout(() => {
            waitForSendSection();
          }, 300);
          return;
        }

        // Special case: When moving from step 18 (index 10) to step 19 (FQ Validation),
        // navigate back to RFX overview
        if (index === 10) {
          setRun(false);
          
          const currentPath = window.location.pathname;
          const rfxIdMatch = currentPath.match(/\/rfx-example\/sending\/([^/]+)/) || currentPath.match(/\/rfx-example\/([^/]+)/);
          
          if (rfxIdMatch) {
            const rfxId = rfxIdMatch[1];
            navigate(`/rfx-example/${rfxId}`);
            
            // Wait for overview page to load and find validation item
            const waitForValidationItem = (retries = 20): void => {
              const item = document.querySelector('[data-onboarding-target="rfx-progress-item-fq_validation"]') as HTMLElement | null;

              if (item) {
                item.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => {
                  setStepIndex(11);
                  setRun(true);
                }, 500);
              } else if (retries > 0) {
                setTimeout(() => waitForValidationItem(retries - 1), 300);
              } else {
                setStepIndex(11);
                setRun(true);
              }
            };

            setTimeout(() => {
              waitForValidationItem();
            }, 1000);
          } else {
            setStepIndex(11);
            setRun(true);
          }
          return;
        }

        // Special case: When moving from step 20 (index 12 - Responses) to step 21 (Supplier Search),
        // navigate to supplier search page
        if (index === 12) {
          setRun(false);
          navigate('/supplier-search');

          const waitForSupplierPage = (retries = 20): void => {
            const page = document.querySelector('[data-onboarding-target="supplier-search-page"]') as HTMLElement | null;
            if (page) {
              setTimeout(() => {
                setStepIndex(13);
                setRun(true);
              }, 500);
            } else if (retries > 0) {
              setTimeout(() => waitForSupplierPage(retries - 1), 300);
            } else {
              setStepIndex(13);
              setRun(true);
            }
          };

          setTimeout(() => waitForSupplierPage(), 1000);
          return;
        }

        // Special case: When moving from step 21 (index 13) to step 22 (Final landing),
        // navigate to home
        if (index === 13) {
          setRun(false);
          navigate('/');
          
          setTimeout(() => {
            setStepIndex(14);
            setRun(true);
          }, 1000);
          return;
        }

        // Special case: When moving to final completion (after step 22, index 14),
        // complete onboarding
        if (index === 14) {
          setRun(false);
          setStepIndex(0); // Reset to first step for next time
          
          setTimeout(async () => {
            // Only save to database if user is logged in
            if (userId) {
              try {
                const { error } = await supabase
                  .from('app_user')
                  .update({ onboarding_completed: true })
                  .eq('auth_user_id', userId);

                if (error) {
                  console.error('Error marking onboarding as completed:', error);
                }
              } catch (error) {
                console.error('Error updating onboarding status:', error);
              }
            } else {
              // For non-authenticated users, save to localStorage
              localStorage.setItem('fq_onboarding_completed', 'true');
            }
            onComplete();
          }, 500);
          return;
        }
        
        setStepIndex(index + 1);
      } else if (action === ACTIONS.PREV) {
        // Handle back navigation with route changes
        
        // Back from step 9 (index 1) to step 1 (index 0): Navigate to home
        if (index === 1) {
          setRun(false);
          navigate('/');
          setTimeout(() => {
            setStepIndex(0);
            setRun(true);
          }, 800);
          return;
        }
        
        // Back from step 17 (index 9) to step 16 (index 8): Navigate to RFX overview
        if (index === 9) {
          setRun(false);
          const currentPath = window.location.pathname;
          const rfxIdMatch = currentPath.match(/\/rfx-example\/specs\/([^/]+)/) || currentPath.match(/\/rfx-example\/([^/]+)/);
          if (rfxIdMatch) {
            const rfxId = rfxIdMatch[1];
            navigate(`/rfx-example/${rfxId}`);
            
            // Wait for overview page to load, then select the specs item and find the button
            setTimeout(() => {
              // First, dispatch event to select the specs item to make the button visible
              const selectEvent = new CustomEvent('onboarding-select-item', { detail: { itemId: 'specs' } });
              window.dispatchEvent(selectEvent);
              
              // Now wait for the button to appear after selection
              const waitForButton = (retries = 20): void => {
                const targetButton = document.querySelector('button[data-onboarding-target="go-to-rfx-specs-button"]') as HTMLElement | null;
                
                if (targetButton) {
                  targetButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  setTimeout(() => {
                    setStepIndex(8);
                    setRun(true);
                  }, 500);
                } else if (retries > 0) {
                  setTimeout(() => waitForButton(retries - 1), 200);
                } else {
                  // If button not found, still set the step index
                  setStepIndex(8);
                  setRun(true);
                }
              };
              
              // Give the selection event time to be processed before looking for the button
              setTimeout(() => {
                waitForButton();
              }, 300);
            }, 1000);
          } else {
            setTimeout(() => {
              setStepIndex(8);
              setRun(true);
            }, 800);
          }
          return;
        }
        
        // Back from step 14 (index 6) to step 13 (index 5): Navigate to specs page
        if (index === 6) {
          setRun(false);
          const currentPath = window.location.pathname;
          const rfxIdMatch = currentPath.match(/\/rfx-example\/candidates\/([^/]+)/) || currentPath.match(/\/rfx-example\/([^/]+)/);
          if (rfxIdMatch) {
            const rfxId = rfxIdMatch[1];
            navigate(`/rfx-example/specs/${rfxId}`);
          }
          setTimeout(() => {
            setStepIndex(5);
            setRun(true);
          }, 800);
          return;
        }
        
        // Back from step 18 (index 10) to step 17 (index 9): Navigate to candidates page
        if (index === 10) {
          setRun(false);
          const currentPath = window.location.pathname;
          const rfxIdMatch = currentPath.match(/\/rfx-example\/sending\/([^/]+)/) || currentPath.match(/\/rfx-example\/([^/]+)/);
          if (rfxIdMatch) {
            const rfxId = rfxIdMatch[1];
            navigate(`/rfx-example/candidates/${rfxId}`);
          }
          setTimeout(() => {
            setStepIndex(9);
            setRun(true);
          }, 800);
          return;
        }
        
        // Back from step 16 (index 8) to step 15 (index 7): Switch back to FQ Recommended tab
        if (index === 8) {
          setRun(false);
          
          // Dispatch event to switch to recommended tab
          window.dispatchEvent(new Event('onboarding-switch-to-recommended-tab'));
          
          // Wait for the tab to switch before advancing
          setTimeout(() => {
            setStepIndex(7); // visual step 15
            setRun(true);
          }, 500);

          return;
        }
        
        // Back from step 19 (index 11) to step 18 (index 10): Navigate to sending page
        if (index === 11) {
          setRun(false);
          const currentPath = window.location.pathname;
          const rfxIdMatch = currentPath.match(/\/rfx-example\/([^/]+)/);
          if (rfxIdMatch) {
            const rfxId = rfxIdMatch[1];
            navigate(`/rfx-example/sending/${rfxId}`);
          }
          setTimeout(() => {
            setStepIndex(10);
            setRun(true);
          }, 800);
          return;
        }
        
        // Back from step 20 (index 12) to step 19 (index 11): Navigate to RFX overview
        if (index === 12) {
          setRun(false);
          navigate('/rfx-example/eac78558-4c3e-4d05-847e-a954c469868a');
          setTimeout(() => {
            setStepIndex(11);
            setRun(true);
          }, 800);
          return;
        }
        
        // Back from step 21 (index 13) to step 20 (index 12): Navigate to supplier search
        if (index === 13) {
          setRun(false);
          navigate('/supplier-search');
          setTimeout(() => {
            setStepIndex(12);
            setRun(true);
          }, 800);
          return;
        }
        
        // Default back behavior (no route change needed)
        setStepIndex(index - 1);
      }
    }

    if (finishedStatuses.includes(status)) {
      setRun(false);
      setStepIndex(0); // Reset to first step for next time

      // Mark onboarding as completed
      // Only save to database if user is logged in
      if (userId) {
        try {
          const { error } = await supabase
            .from('app_user')
            .update({ onboarding_completed: true })
            .eq('auth_user_id', userId);

          if (error) {
            console.error('Error marking onboarding as completed:', error);
          }
        } catch (error) {
          console.error('Error updating onboarding status:', error);
        }
      } else {
        // For non-authenticated users, save to localStorage
        localStorage.setItem('fq_onboarding_completed', 'true');
      }

      // Call the completion callback
      onComplete();
    }
  };

  return (
    <Joyride
      steps={steps}
      run={run}
      stepIndex={stepIndex}
      continuous
      showSkipButton
      disableCloseOnEsc
      disableOverlayClose
      hideCloseButton
      callback={handleJoyrideCallback}
      styles={customStyles}
      floaterProps={{
        style: {
          zIndex: 10080,
        },
      }}
      locale={{
        back: 'Back',
        close: 'Close',
        last: 'Finish',
        next: 'Next',
        skip: 'Skip',
      }}
    />
  );
};

export default OnboardingTour;

