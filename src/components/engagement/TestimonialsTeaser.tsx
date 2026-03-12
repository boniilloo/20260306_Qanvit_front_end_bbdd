
import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { TrendingUp, Phone, Star } from 'lucide-react';

const TestimonialsTeaser = () => {
  const testimonials = [
    {
      quote: "After claiming our profile, we saw a 40% increase in visibility",
      company: "TechMold Industries",
      role: "Sales Director"
    },
    {
      quote: "Profile optimization led to 25% more qualified RFX requests",
      company: "Precision Components Ltd",
      role: "Marketing Manager"
    }
  ];

  return (
    <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-200">
      <div className="text-center mb-6">
        <motion.div
          className="w-16 h-16 bg-gradient-to-br from-[#f4a9aa] to-[#f4a9aa] rounded-full flex items-center justify-center mx-auto mb-4"
          animate={{ rotate: [0, 5, -5, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <TrendingUp className="w-8 h-8 text-white" />
        </motion.div>
        
        <h2 className="text-xl font-bold font-intro text-[#22183a] mb-2">
          Success Stories
        </h2>
        <p className="text-sm text-gray-600 font-inter">
          See how suppliers boost their visibility
        </p>
      </div>
      
      {/* Testimonial slider */}
      <div className="space-y-4 mb-6">
        {testimonials.map((testimonial, index) => (
          <motion.div
            key={index}
            className="p-4 bg-gray-50 rounded-xl border border-gray-100"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.2 }}
          >
            <div className="flex items-start gap-2 mb-2">
              <div className="flex">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
            </div>
            
            <blockquote className="text-sm text-[#22183a] font-inter mb-2 italic">
              "{testimonial.quote}"
            </blockquote>
            
            <div className="text-xs text-gray-600 font-inter">
              <div className="font-semibold">{testimonial.company}</div>
              <div>{testimonial.role}</div>
            </div>
          </motion.div>
        ))}
      </div>
      
      {/* Stats highlight */}
      <motion.div
        className="bg-gradient-to-r from-[#f4a9aa]/10 to-[#f4a9aa]/10 rounded-xl p-4 mb-6 border border-[#f4a9aa]/20"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5 }}
      >
        <div className="text-center">
          <div className="text-2xl font-bold text-[#22183a] font-intro">+40%</div>
          <div className="text-sm text-gray-600 font-inter">Average visibility increase</div>
        </div>
      </motion.div>
      
      {/* CTA */}
      <Button 
        variant="outline" 
        className="w-full font-inter border-[#f4a9aa] text-[#f4a9aa] hover:bg-[#f4a9aa] hover:text-white transition-colors"
      >
        <Phone className="w-4 h-4 mr-2" />
        Book Onboarding Call
      </Button>
    </div>
  );
};

export default TestimonialsTeaser;
