import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			fontFamily: {
				sans: ['Inter', 'Helvetica Neue', 'Arial', 'sans-serif'],
				inter: ['Inter', 'sans-serif'],
			},
			spacing: {
				18: '4.5rem'
			},
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: '#1BB3FF', // Electric Cyan/Blue
					light: '#47C8FF',
					dark: '#0092DB',
					foreground: '#FFFFFF'
				},
				navy: {
					DEFAULT: '#1B2C4A', // Primary Navy from design spec
					light: '#2A3F5F',
					dark: '#0F1B2E',
				},
				sky: {
					DEFAULT: '#80C8F0', // Sky accent from design spec
					light: '#A3D4F3',
					dark: '#5DB8ED',
				},
				mint: {
					DEFAULT: '#7DE19A', // Mint CTA primary from design spec
					light: '#9EE8B1',
					dark: '#5CD483',
				},
				charcoal: {
					DEFAULT: '#242424', // Text color from design spec
				},
				teal: {
					DEFAULT: '#00B3A4', // Keep existing teal for backward compatibility
					dark: '#008F83',
				},
				canvas: '#F4F6F8', // Light grey from design spec
				error: '#E94B3C', // Error red from design spec
				accent: {
					blue: '#109CF1', // Accent blue from design spec
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				},
				// Adding accent UI colors
				amber: {
					50: '#FFF8E6', 
					500: '#F59E0B'  // Amber/Gold
				},
				emerald: {
					50: '#ECFDF5',
					600: '#059669'  // Emerald Green
				},
				purple: {
					50: '#F5F3FF',
					600: '#7C3AED'  // Purple
				},
				blue: {
					50: '#EFF6FF',
					600: '#2563EB',  // Blue
					700: '#1D4ED8'   // Border blue
				},
				gray: {
					100: '#F3F4F6',
					200: '#E5E7EB',
					400: '#9CA3AF',
					600: '#6B7280'   // Gray Text
				}
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0'
					},
					to: {
						height: 'var(--radix-accordion-content-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)'
					},
					to: {
						height: '0'
					}
				},
				'card-hover': {
					'0%': { transform: 'translateY(0)', boxShadow: '0 4px 8px rgba(0, 0, 0, 0.08)' },
					'100%': { transform: 'translateY(-2px)', boxShadow: '0 6px 12px rgba(0, 0, 0, 0.12)' }
				},
				'fade-in': {
					'0%': { opacity: '0', transform: 'translateY(10px)' },
					'100%': { opacity: '1', transform: 'translateY(0)' }
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'card-hover': 'card-hover 0.2s ease-out forwards',
				'fade-in': 'fade-in 0.3s ease-out forwards'
			},
			backgroundImage: {
				'sunset-gradient': 'linear-gradient(135deg, #FFC7A2, #FFEBA8)',
				'navy-gradient': 'linear-gradient(135deg, #0d1d2d, #07121f)',
			}
		}
	},
	plugins: [
		require("tailwindcss-animate"),
		require("@tailwindcss/line-clamp"),
		require("@tailwindcss/typography"),
	],
} satisfies Config;
