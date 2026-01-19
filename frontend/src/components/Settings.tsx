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
        <h1>Paramètres</h1>
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
