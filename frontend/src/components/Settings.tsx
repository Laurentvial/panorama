import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Customization } from './Customization';
import '../styles/PageHeader.css';
import '../styles/Settings.css';

export function Settings() {
  return (
    <div className="settings-page">
      <div className="page-header">
        <div className="page-title-section">
          <h1 className="page-title">Paramètres</h1>
          <p className="page-subtitle">Configuration de l'application</p>
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Configuration de l'application</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="customization" className="settings-tabs">
            <TabsList>
              <TabsTrigger value="customization">Personnalisation</TabsTrigger>
            </TabsList>
            <TabsContent value="customization" className="settings-tabs-content">
              <Customization />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
