export const theme = {
    colors: {
        primary: '#4F46E5', // Indigo-600
        primaryLight: '#818CF8', // Indigo-400
        secondary: '#10B981', // Emerald-500
        secondaryLight: '#34D399', // Emerald-400
        background: '#F9FAFB', // Gray-50
        surface: '#FFFFFF',
        text: {
            primary: '#111827', // Gray-900
            secondary: '#6B7280', // Gray-500
            light: '#F3F4F6', // Gray-100
            accent: '#4F46E5',
        },
        error: '#EF4444',
        success: '#10B981',
        warning: '#F59E0B',
        border: '#E5E7EB',
        gradients: {
            primary: ['#4F46E5', '#818CF8'] as const,
            secondary: ['#10B981', '#34D399'] as const,
            surface: ['#FFFFFF', '#F9FAFB'] as const,
            darkParams: ['#1F2937', '#111827'] as const, // For dark mode look
        }
    },
    spacing: {
        xs: 4,
        s: 8,
        m: 16,
        l: 24,
        xl: 32,
        xxl: 48,
    },
    borderRadius: {
        s: 8,
        m: 12,
        l: 16,
        xl: 24,
        circle: 9999,
    },
    typography: {
        sizes: {
            xs: 12,
            s: 14,
            m: 16,
            l: 20,
            xl: 24,
            xxl: 32,
        },
        weights: {
            regular: '400',
            medium: '500',
            bold: '700',
            black: '900',
        },
        lineHeights: {
            s: 20,
            m: 24,
            l: 30,
            xl: 36,
        },
    },
    shadows: {
        small: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 3,
            elevation: 2,
        },
        medium: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 6,
            elevation: 4,
        },
        large: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.2,
            shadowRadius: 10,
            elevation: 10,
        },
        primaryGlow: {
            shadowColor: '#4F46E5',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.3,
            shadowRadius: 12,
            elevation: 8,
        }
    },
};

export type Theme = typeof theme;
