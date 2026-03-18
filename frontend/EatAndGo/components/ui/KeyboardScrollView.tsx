import React, { createContext, useContext, useRef } from 'react';
import { ScrollView, ScrollViewProps } from 'react-native';

const KeyboardScrollContext = createContext<React.RefObject<ScrollView | null> | null>(null);

export const useKeyboardScrollRef = () => useContext(KeyboardScrollContext);

interface KeyboardScrollViewProps extends ScrollViewProps {
  children: React.ReactNode;
}

export const KeyboardScrollView = ({ children, ...props }: KeyboardScrollViewProps) => {
  const scrollRef = useRef<ScrollView>(null);

  return (
    <KeyboardScrollContext.Provider value={scrollRef}>
      <ScrollView ref={scrollRef} {...props}>
        {children}
      </ScrollView>
    </KeyboardScrollContext.Provider>
  );
};