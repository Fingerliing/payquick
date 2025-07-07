import React from 'react';
import { View, ViewStyle } from 'react-native';
import { Card } from '../ui/Card';

interface LoadingSkeletonProps {
  variant: 'restaurant' | 'order' | 'menu';
  count?: number;
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  variant,
  count = 3,
}) => {
  const skeletonStyle: ViewStyle = {
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
  };

  const animatedStyle: ViewStyle = {
    ...skeletonStyle,
    // Animation simple avec opacity
  };

  const renderRestaurantSkeleton = () => (
    <Card style={{ marginHorizontal: 16, marginBottom: 12 }} padding={0}>
      <View style={[animatedStyle, { height: 160, borderRadius: 8 }]} />
      <View style={{ padding: 12 }}>
        <View style={[animatedStyle, { height: 20, width: '70%', marginBottom: 8 }]} />
        <View style={[animatedStyle, { height: 14, width: '50%', marginBottom: 8 }]} />
        <View style={[animatedStyle, { height: 14, width: '60%' }]} />
      </View>
    </Card>
  );

  const renderOrderSkeleton = () => (
    <Card style={{ marginHorizontal: 16, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <View style={[animatedStyle, { height: 18, width: '60%', marginBottom: 8 }]} />
          <View style={[animatedStyle, { height: 14, width: '40%', marginBottom: 8 }]} />
          <View style={[animatedStyle, { height: 12, width: '30%' }]} />
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <View style={[animatedStyle, { height: 18, width: 60, marginBottom: 8 }]} />
          <View style={[animatedStyle, { height: 14, width: 80 }]} />
        </View>
      </View>
    </Card>
  );

  const renderMenuSkeleton = () => (
    <Card style={{ marginHorizontal: 16, marginBottom: 12 }}>
      <View style={[animatedStyle, { height: 20, width: '50%', marginBottom: 12 }]} />
      <View style={[animatedStyle, { height: 14, width: '80%', marginBottom: 16 }]} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={[animatedStyle, { height: 12, width: '30%' }]} />
        <View style={[animatedStyle, { height: 12, width: '25%' }]} />
        <View style={[animatedStyle, { height: 12, width: '20%' }]} />
      </View>
    </Card>
  );

  const renderSkeleton = () => {
    switch (variant) {
      case 'restaurant':
        return renderRestaurantSkeleton();
      case 'order':
        return renderOrderSkeleton();
      case 'menu':
        return renderMenuSkeleton();
      default:
        return null;
    }
  };

  return (
    <View>
      {Array.from({ length: count }, (_, index) => (
        <View key={index}>{renderSkeleton()}</View>
      ))}
    </View>
  );
};