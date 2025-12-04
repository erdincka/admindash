'use client'

import React, { useState, useEffect } from 'react'
import { Box, Button, Form, FormField, TextInput, Select, CheckBox, Heading, Page, PageContent } from 'grommet'
import { useRouter } from 'next/navigation'
import { deploymentsApi, namespacesApi } from '@/lib/api/deployments'
import { DeploymentCreate } from '@/types/deployment'
import { notify } from '@/lib/utils/notifications'

export default function DeployPage() {
    const router = useRouter()
    const [namespaces, setNamespaces] = useState<string[]>([])
    const [loading, setLoading] = useState(false)

    const [formData, setFormData] = useState<DeploymentCreate>({
        name: '',
        namespace: 'default',
        image: '',
        port: undefined,
        replicas: 1,
        expose_service: false,
        service_type: 'ClusterIP',
        env_vars: {},
        volume_mounts: [],
    })

    useEffect(() => {
        loadNamespaces()
    }, [])

    const loadNamespaces = async () => {
        try {
            const response = await namespacesApi.list()
            if (response.data) {
                setNamespaces(response.data.map(ns => ns.name))
            }
        } catch (error) {
            console.error('Failed to load namespaces:', error)
        }
    }

    const handleSubmit = async () => {
        setLoading(true)
        try {
            await deploymentsApi.create(formData)
            notify.success(`Deployment ${formData.name} created successfully`)
            router.push('/apps')
        } catch (error: any) {
            notify.error(error.message || 'Failed to create deployment')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Page kind="narrow">
            <PageContent>
                <Box pad="large" gap="medium">
                    <Heading level="2">Deploy Container</Heading>

                    <Form
                        value={formData}
                        onChange={(nextValue: any) => setFormData(nextValue)}
                        onSubmit={handleSubmit}
                    >
                        <FormField name="name" label="Name" required>
                            <TextInput
                                name="name"
                                placeholder="my-app"
                                pattern="^[a-z0-9]([-a-z0-9]*[a-z0-9])?$"
                            />
                        </FormField>

                        <FormField name="namespace" label="Namespace">
                            <Select
                                name="namespace"
                                options={namespaces}
                                value={formData.namespace}
                            />
                        </FormField>

                        <FormField name="image" label="Container Image" required>
                            <TextInput
                                name="image"
                                placeholder="nginx:latest"
                            />
                        </FormField>

                        <FormField name="port" label="Port">
                            <TextInput
                                name="port"
                                type="number"
                                placeholder="8080"
                            />
                        </FormField>

                        <FormField name="replicas" label="Replicas">
                            <TextInput
                                name="replicas"
                                type="number"
                                min={0}
                                max={10}
                            />
                        </FormField>

                        <FormField name="expose_service" label="Expose as Service">
                            <CheckBox
                                name="expose_service"
                                checked={formData.expose_service}
                                onChange={(e) => setFormData({ ...formData, expose_service: e.target.checked })}
                            />
                        </FormField>

                        {formData.expose_service && (
                            <FormField name="service_type" label="Service Type">
                                <Select
                                    name="service_type"
                                    options={['ClusterIP', 'NodePort', 'LoadBalancer']}
                                    value={formData.service_type}
                                />
                            </FormField>
                        )}

                        <Box direction="row" gap="medium" margin={{ top: 'medium' }}>
                            <Button type="submit" primary label="Deploy" disabled={loading} />
                            <Button label="Cancel" onClick={() => router.push('/apps')} />
                        </Box>
                    </Form>
                </Box>
            </PageContent>
        </Page>
    )
}
