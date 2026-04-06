// styles/UserTypeStyles.js
import { StyleSheet, Dimensions, Platform } from 'react-native';

const { width, height } = Dimensions.get('window');

export const styles = StyleSheet.create({
  gradientBackground: {
    flex: 1,
  },
  
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: Platform.OS === 'ios' ? 20 : 24,
  },
  
  container: {
    flex: 1,
    width: '100%',
    marginHorizontal: 'auto',
  },
  
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: width * 0.05, // 5% of screen width
    paddingVertical: height * 0.03, // 3% of screen height
  },
  
  logoWrapper: {
    alignItems: 'center',
    marginTop: height * 0.02,
    marginBottom: height * 0.03,
  },
  
  logoWrapperTablet: {
    marginTop: height * 0.01,
    marginBottom: height * 0.02,
  },
  
  logoGlow: {
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(233, 122, 62, 0.1)',
    shadowColor: '#E97A3E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  
  logo: {
    borderRadius: 100,
  },
  
  textContainer: {
    alignItems: 'center',
    marginBottom: height * 0.04,
  },
  
  title: {
    fontWeight: '700',
    textAlign: 'center',
    color: "#183B5C",
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  
  titleGradient: {
    color: '#E97A3E',
    position: 'relative',
  },
  
  subtitle: {
    textAlign: 'center',
    color: '#666666',
    fontWeight: '400',
    letterSpacing: 0.3,
  },
  
  optionsContainer: {
    marginBottom: height * 0.04,
  },
  
  optionsContainerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 20,
  },
  
  optionCard: {
    marginBottom: 16,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  
  optionCardRow: {
    flex: 1,
    minWidth: 280,
    maxWidth: 400,
    marginBottom: 0,
  },
  
  optionCardSelected: {
    shadowColor: '#E97A3E',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  
  optionCardPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  
  cardGradient: {
    borderRadius: 20,
  },
  
  cardContent: {
    alignItems: 'center',
  },
  
  iconContainer: {
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(233, 122, 62, 0.1)',
    marginBottom: 16,
  },
  
  iconContainerSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  
  optionTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
    color:  "#183B5C",
  },
  
  optionTitleSelected: {
    color: '#FFFFFF',
  },
  
  optionDescription: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666666',
    lineHeight: 20,
  },
  
  optionDescriptionSelected: {
    color: 'rgba(255, 255, 255, 0.9)',
  },
  
  selectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 16,
    gap: 6,
  },
  
  selectedBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  
  footer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  
  footerText: {
    textAlign: 'center',
    color: '#888888',
    lineHeight: 20,
  },
  
  footerLink: {
    color: '#E97A3E',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});

// Additional responsive utilities
export const getResponsiveFontSize = (size) => {
  const scale = Math.min(Dimensions.get('window').width / 375, 1.5);
  return size * scale;
};

export const getResponsivePadding = (base) => {
  const width = Dimensions.get('window').width;
  if (width >= 1024) return base * 1.5;
  if (width >= 768) return base * 1.2;
  return base;
};